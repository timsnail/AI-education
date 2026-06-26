const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const DEFAULT_CLAUDE_MODEL = "claude-opus-4-8";
// Llama 3.2 Vision（Cloudflare-hosted，免費）。要換可設環境變數 VISION_MODEL。
const DEFAULT_VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

const VISION_PROMPT =
  "你是把題目照片轉成文字的助手。請把這張圖片裡的「題目」完整、逐字轉成文字。" +
  "若題目含有圖形、表格、座標圖或數學式，請用文字清楚描述或寫出（數學式用一般文字，例如 x^2、(x-3)^2）。" +
  "只輸出題目本身，不要解題、不要加任何開場白或說明。用繁體中文。";

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
            { type: "text", text: VISION_PROMPT }
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
  const model = env.VISION_MODEL || DEFAULT_VISION_MODEL;
  const bytes = Array.from(base64ToBytes(base64));

  // 多數 Workers AI 視覺模型用 image 位元組陣列；少數吃 messages + image_url，兩種都試。
  let output;
  try {
    output = await env.AI.run(model, { image: bytes, prompt: VISION_PROMPT, max_tokens: 1024 });
  } catch (error) {
    output = await env.AI.run(model, {
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: VISION_PROMPT },
            { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64}` } }
          ]
        }
      ]
    });
  }

  const text = extractText(output).trim();
  if (!text) throw new Error("empty vision response");
  return text.slice(0, 4000);
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
