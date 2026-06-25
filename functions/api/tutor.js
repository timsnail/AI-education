const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const DEFAULT_CLAUDE_MODEL = "claude-opus-4-8";
const DEFAULT_WORKERS_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";

const SYSTEM_PROMPT = `你是台灣國高中的 AI 家教，對齊 108 課綱與會考/學測。你會一步一步「引導」學生自己解出題目，而不是直接給答案。

互動規則：
1. 第一輪（學生剛上傳題目時）：先點出這題的「核心概念」，並提出 2～4 個可能的解題切入方向當作 choices，讓學生選要用哪個概念/方法。stage 設為 "approach"。
2. 之後每一輪：只帶「一小步」。多用提問引導學生算出這一步，不要一次做完。若這一步有明確選項，放進 choices；否則請學生自己算並用文字回覆（expects_input 設 true）。stage 設為 "step"。
3. 學生答對：肯定他，進到下一步。學生答錯：溫和點出哪裡卡住、給提示，讓他再試一次，仍然不直接給答案。
4. 當所有步驟都完成、學生已得到最終答案：stage 設為 "done"，is_complete 設 true，並在 summary 給「綜合結論講解」（這題用到什麼概念、解題關鍵、容易錯在哪），同時填 concepts_practiced（本題練到的概念）與 weak_points（學生這次比較不熟、卡住的點）。

語氣鼓勵、簡潔，全部用繁體中文（台灣用語）。數學式用一般文字（例如 (x-3)^2、x^2）。

只輸出「一個 JSON 物件」，不要任何其他文字、不要 markdown 程式碼框、不要 <think> 標籤，欄位如下：
{"stage":"approach","concept":"","message":"","choices":[],"expects_input":false,"is_complete":false,"summary":"","concepts_practiced":[],"weak_points":[]}`;

export async function onRequestGet(context) {
  return json({ success: true, message: "tutor API is ready.", mode: detectMode(context?.env) });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export async function onRequestPost(context) {
  try {
    const env = context?.env || {};
    const body = await context.request.json();
    const subject = cleanText(body.subject || "通用");
    const difficulty = cleanText(body.difficulty || "junior");
    const problem = cleanText(body.problem);
    const history = Array.isArray(body.history) ? body.history.slice(-16) : [];

    if (!problem && history.length === 0) {
      return json({ success: false, error: "problem is required." }, 400);
    }

    const messages = buildMessages({ subject, difficulty, problem, history });

    if (env.ANTHROPIC_API_KEY) {
      try {
        const turn = await tutorWithClaude(env, messages);
        return json({ success: true, turn, mode: "claude-diagnosis" });
      } catch (error) {
        return json({ success: false, error: `claude failed: ${short(error)}` }, 502);
      }
    }

    if (env.AI && typeof env.AI.run === "function") {
      try {
        const turn = await tutorWithWorkersAI(env, messages);
        return json({ success: true, turn, mode: "workers-ai-diagnosis" });
      } catch (error) {
        return json({ success: false, error: `workers-ai failed: ${short(error)}` }, 502);
      }
    }

    return json({ success: false, error: "no AI backend configured (set ANTHROPIC_API_KEY or AI binding)." }, 503);
  } catch (error) {
    return json({ success: false, error: error.message || "Unexpected API error." }, 500);
  }
}

function buildMessages({ subject, difficulty, problem, history }) {
  const out = [{ role: "system", content: SYSTEM_PROMPT }];
  if (history.length === 0) {
    out.push({
      role: "user",
      content:
        `科目：${subject}\n難度：${difficultyLabel(difficulty)}\n\n題目：\n${problem}\n\n` +
        `請依系統指示開始引導我（第一輪：點出核心概念並給我解題方向的選項）。只回覆 JSON。`
    });
  } else {
    for (const turn of history) {
      const role = turn.role === "assistant" ? "assistant" : "user";
      out.push({ role, content: cleanText(turn.content).slice(0, 2000) });
    }
  }
  return out;
}

async function tutorWithClaude(env, messages) {
  const system = messages[0].content;
  const convo = messages.slice(1).map((m) => ({ role: m.role, content: m.content }));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: env.GRADER_MODEL || DEFAULT_CLAUDE_MODEL,
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system,
      messages: convo
    })
  });

  if (!response.ok) throw new Error(`Anthropic ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = await response.json();
  if (data.stop_reason === "refusal") throw new Error("model refused");
  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock || !textBlock.text) throw new Error("empty response");
  return normalizeTurn(parseJson(textBlock.text));
}

async function tutorWithWorkersAI(env, messages) {
  const output = await env.AI.run(env.WORKERS_AI_MODEL || DEFAULT_WORKERS_MODEL, {
    max_tokens: 1024,
    messages
  });
  const raw = extractText(output);
  if (!raw) throw new Error("empty workers-ai response");
  return normalizeTurn(parseJson(raw));
}

function normalizeTurn(parsed) {
  const stage = ["approach", "step", "done"].includes(parsed.stage) ? parsed.stage : "step";
  const isComplete = Boolean(parsed.is_complete) || stage === "done";
  return {
    stage,
    concept: cleanField(parsed.concept),
    message: cleanField(parsed.message) || "我們一步一步來看這題。",
    choices: Array.isArray(parsed.choices)
      ? parsed.choices.map((c) => cleanField(c)).filter(Boolean).slice(0, 5)
      : [],
    expectsInput: parsed.expects_input !== false && !isComplete,
    isComplete,
    summary: cleanField(parsed.summary),
    conceptsPracticed: Array.isArray(parsed.concepts_practiced)
      ? parsed.concepts_practiced.map((c) => cleanField(c)).filter(Boolean).slice(0, 8)
      : [],
    weakPoints: Array.isArray(parsed.weak_points)
      ? parsed.weak_points.map((c) => cleanField(c)).filter(Boolean).slice(0, 8)
      : []
  };
}

function extractText(output) {
  if (!output) return "";
  if (typeof output === "string") return output;
  if (typeof output.response === "string") return output.response;
  const choice = output.choices && output.choices[0];
  if (choice && choice.message && typeof choice.message.content === "string") return choice.message.content;
  return "";
}

function parseJson(raw) {
  let text = String(raw || "");
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  text = text.replace(/```json/gi, "").replace(/```/g, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("no JSON object found in model output");
  return JSON.parse(text.slice(start, end + 1));
}

function detectMode(env) {
  if (env?.ANTHROPIC_API_KEY) return "claude-diagnosis";
  if (env?.AI && typeof env.AI.run === "function") return "workers-ai-diagnosis";
  return "none";
}

function difficultyLabel(difficulty) {
  return { junior: "國中題", senior: "高中題", college: "延伸題" }[difficulty] || difficulty;
}

function cleanText(value) {
  return String(value || "").trim().slice(0, 5000);
}

function cleanField(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "無") return "";
  return text.slice(0, 1200);
}

function short(error) {
  return (error && error.message ? error.message : String(error)).slice(0, 200);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}
