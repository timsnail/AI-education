const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const DEFAULT_CLAUDE_MODEL = "claude-opus-4-8";
// Llama 3.2 Vision（Cloudflare-hosted，免費）。要換可設環境變數 VISION_MODEL。
const DEFAULT_VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
// 第二階段抽題用的文字模型（Qwen3，中文好）。
const DEFAULT_TEXT_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";

// Claude 指令遵循強，單階段嚴格 OCR 即可。
const CLAUDE_OCR_PROMPT =
  "你是 OCR 工具。把圖片上的題目逐字抄出來，數學式用一般文字（例如 x^2、(x-3)^2）。" +
  "若有圖形或表格，用一句話描述。絕對不要解題、不要計算、不要給答案、不要任何說明。只輸出題目本身。";

// Llama Vision 不擅長「只抄」，但擅長「描述」——讓它把看到的東西全列出來（英文指令遵循較好）。
const WAI_DESCRIBE_PROMPT =
  "List every piece of text and every math expression visible in this image, exactly as written. " +
  "If there is a figure, chart or table, describe it in one short sentence. Do not solve anything, do not add answers.";

// 第二階段：文字模型從上面的描述中抽出「題目本身」，丟掉雜訊與任何被亂加的答案。
const EXTRACT_SYSTEM =
  "以下是一張「題目照片」的辨識內容，可能夾雜雜訊、描述文字或被多餘加上的答案。" +
  "請從中整理出學生真正要解的『題目本身』，用繁體中文清楚重述一次，數學式用一般文字（例如 x^2）。" +
  "只輸出題目，絕對不要解題、不要給答案、不要任何說明或開場白。";

export async function onRequestGet(context) {
  return json({ success: true, message: "vision API is ready.", mode: detectMode(context?.env) });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export async function onRequestPost(context) {
  try {
    const env = context?.env || {};
    const body = await context.request.json();
    const { mediaType, base64 } = parseImage(cleanText(body.image, 12_000_000));

    if (!base64) {
      return json({ success: false, error: "image (base64 or data URL) is required." }, 400);
    }

    if (env.ANTHROPIC_API_KEY) {
      try {
        const problem = await readWithClaude(env, mediaType, base64);
        return json({ success: true, problem, mode: "claude-vision" });
      } catch (error) {
        return json({ success: false, error: `claude vision failed: ${short(error)}` }, 502);
      }
    }

    if (env.AI && typeof env.AI.run === "function") {
      try {
        const problem = await readWithWorkersAI(env, mediaType, base64);
        return json({ success: true, problem, mode: "workers-ai-vision" });
      } catch (error) {
        return json({ success: false, error: `workers-ai vision failed: ${short(error)}` }, 502);
      }
    }

    return json({ success: false, error: "no AI backend configured." }, 503);
  } catch (error) {
    return json({ success: false, error: error.message || "Unexpected API error." }, 500);
  }
}

async function readWithClaude(env, mediaType, base64) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: env.GRADER_MODEL || DEFAULT_CLAUDE_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: CLAUDE_OCR_PROMPT }
          ]
        }
      ]
    })
  });

  if (!response.ok) throw new Error(`Anthropic ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = await response.json();
  const textBlock = (data.content || []).find((b) => b.type === "text");
  const text = textBlock && textBlock.text ? textBlock.text.trim() : "";
  if (!text) throw new Error("empty vision response");
  return text.slice(0, 4000);
}

async function readWithWorkersAI(env, mediaType, base64) {
  const visionModel = env.VISION_MODEL || DEFAULT_VISION_MODEL;
  const textModel = env.WORKERS_AI_MODEL || DEFAULT_TEXT_MODEL;
  const bytes = Array.from(base64ToBytes(base64));
  const dataUrl = `data:${mediaType};base64,${base64}`;

  // 第一階段：視覺模型「描述」圖片裡的文字（含一次性授權同意重試）。
  let raw;
  try {
    raw = extractText(await runVisionOnce(env.AI, visionModel, bytes, dataUrl));
  } catch (error) {
    if (needsLicenseAgreement(error)) {
      await env.AI.run(visionModel, { prompt: "agree" });
      raw = extractText(await runVisionOnce(env.AI, visionModel, bytes, dataUrl));
    } else {
      throw error;
    }
  }
  raw = raw.trim();
  if (!raw) throw new Error("empty vision response");

  // 第二階段：文字模型從描述中抽出「題目本身」，去掉雜訊與被亂加的答案。
  try {
    const out = await env.AI.run(textModel, {
      max_tokens: 600,
      messages: [
        { role: "system", content: EXTRACT_SYSTEM },
        { role: "user", content: raw.slice(0, 3000) }
      ]
    });
    const cleaned = stripThink(extractText(out));
    if (cleaned) return cleaned.slice(0, 4000);
  } catch (_) {
    // 抽取失敗就退回第一階段的原始辨識。
  }

  return raw.slice(0, 4000);
}

async function runVisionOnce(ai, model, bytes, dataUrl) {
  // 多數 Workers AI 視覺模型用 image 位元組陣列；少數吃 messages + image_url。
  try {
    return await ai.run(model, { image: bytes, prompt: WAI_DESCRIBE_PROMPT, max_tokens: 1024 });
  } catch (error) {
    if (needsLicenseAgreement(error)) throw error; // 授權問題交給上層處理
    return await ai.run(model, {
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: WAI_DESCRIBE_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        }
      ]
    });
  }
}

function stripThink(text) {
  return String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

function needsLicenseAgreement(error) {
  const msg = (error && error.message ? error.message : String(error)).toLowerCase();
  return (
    msg.includes("5016") ||
    msg.includes("must submit") ||
    msg.includes("community license") ||
    msg.includes("'agree'")
  );
}

function extractText(output) {
  if (!output) return "";
  if (typeof output === "string") return output;
  if (typeof output.response === "string") return output.response;
  if (typeof output.description === "string") return output.description;
  const choice = output.choices && output.choices[0];
  if (choice && choice.message && typeof choice.message.content === "string") return choice.message.content;
  return "";
}

function parseImage(value) {
  const s = String(value || "");
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(s);
  if (match) return { mediaType: match[1], base64: match[2] };
  return { mediaType: "image/jpeg", base64: s };
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function detectMode(env) {
  if (env?.ANTHROPIC_API_KEY) return "claude-vision";
  if (env?.AI && typeof env.AI.run === "function") return "workers-ai-vision";
  return "none";
}

function cleanText(value, max = 5000) {
  return String(value || "").trim().slice(0, max);
}

function short(error) {
  return (error && error.message ? error.message : String(error)).slice(0, 200);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}
