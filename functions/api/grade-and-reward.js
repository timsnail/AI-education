const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

// 預設用最強的 Claude Opus 4.8。正式上線若要壓低成本/延遲，
// 在 Cloudflare 設環境變數 GRADER_MODEL=claude-haiku-4-5 或 claude-sonnet-4-6 即可切換。
const DEFAULT_MODEL = "claude-opus-4-8";

const DIAGNOSIS_SCHEMA = {
  type: "object",
  properties: {
    is_correct: { type: "boolean" },
    score: { type: "integer" },
    error_step: { type: "string" },
    misconception: { type: "string" },
    diagnosis: { type: "string" },
    hint: { type: "string" },
    followup_question: { type: "string" },
    reason: { type: "string" }
  },
  required: [
    "is_correct",
    "score",
    "error_step",
    "misconception",
    "diagnosis",
    "hint",
    "followup_question",
    "reason"
  ],
  additionalProperties: false
};

const SYSTEM_PROMPT = `你是台灣國高中的學科家教，專長是「診斷學生哪裡不會」，對齊台灣 108 課綱與會考/學測題型。

你會收到一道題目和一份學生的作答。請依下列原則回覆：

1. 絕對不要直接寫出最終答案或完整正解。你的任務是讓學生「學會」，不是替他寫答案。
2. 找出學生作答中第一個關鍵錯誤發生在哪一步（error_step）。若作答正確，error_step 填「無」。
3. 為這個錯誤命名背後的迷思概念（misconception），例如「負號分配錯誤」「通分時忘記同乘分母」。若無則填「無」。
4. diagnosis：用一兩句話具體說明錯在哪、為什麼錯，但不給出正確答案。
5. hint：給一個蘇格拉底式的引導問題或提示，逼學生自己想出下一步，仍然不給答案。
6. followup_question：出一題「同一個概念、難度相近」的全新練習題，讓學生立刻練習剛剛卡住的地方。
7. score：0–100，反映這份作答的正確程度與完整度。is_correct 在 score >= 70 時為 true。
8. reason：一句話評語（給介面顯示用）。

語氣鼓勵、精準、簡潔，用繁體中文（台灣用語）。`;

export async function onRequestGet(context) {
  const hasKey = Boolean(context?.env?.ANTHROPIC_API_KEY);
  return json({
    success: true,
    message: "grade-and-reward API is ready.",
    mode: hasKey ? "claude-diagnosis" : "rule-based-free"
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const question = cleanText(body.question);
    const answer = cleanText(body.answer);
    const difficulty = cleanText(body.difficulty || "junior");
    const subject = cleanText(body.subject || "通用");

    if (!question || !answer) {
      return json(
        {
          success: false,
          error: "question and answer are required."
        },
        400
      );
    }

    const apiKey = context?.env?.ANTHROPIC_API_KEY;

    if (apiKey) {
      try {
        const result = await gradeWithClaude({
          apiKey,
          model: context.env.GRADER_MODEL || DEFAULT_MODEL,
          question,
          answer,
          difficulty,
          subject
        });
        return json({ success: true, ...result, txHash: null });
      } catch (error) {
        // Claude 失敗時退回規則式評分，學生端永不卡死。
        const fallback = gradeAnswer({ question, answer, difficulty, subject });
        return json({
          success: true,
          ...fallback,
          txHash: null,
          mode: "rule-based-fallback",
          fallbackReason: error.message || "claude request failed"
        });
      }
    }

    // 沒有設定金鑰：維持白皮書第一階段「零付費依賴」的規則式評分。
    const result = gradeAnswer({ question, answer, difficulty, subject });
    return json({
      success: true,
      ...result,
      txHash: null,
      mode: "rule-based-free"
    });
  } catch (error) {
    return json(
      {
        success: false,
        error: error.message || "Unexpected API error."
      },
      500
    );
  }
}

async function gradeWithClaude({ apiKey, model, question, answer, difficulty, subject }) {
  const userText =
    `科目：${subject}\n難度：${difficultyLabel(difficulty)}\n\n` +
    `題目：\n${question}\n\n學生的作答：\n${answer}\n\n` +
    `請依系統指示診斷這份作答，並以指定的 JSON 結構回覆。`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: DIAGNOSIS_SCHEMA }
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userText }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  if (data.stop_reason === "refusal") {
    throw new Error("model refused the request");
  }

  const textBlock = (data.content || []).find((block) => block.type === "text");
  if (!textBlock || !textBlock.text) {
    throw new Error("empty model response");
  }

  const parsed = JSON.parse(textBlock.text);
  const score = clamp(Number(parsed.score) || 0, 0, 100);
  const isCorrect = typeof parsed.is_correct === "boolean" ? parsed.is_correct : score >= 70;
  const rewardTokens = isCorrect ? calculateReward(score, difficulty) : 0;

  return {
    is_correct: isCorrect,
    score,
    confidence: isCorrect ? 0.9 : 0.78,
    rewarded: isCorrect,
    rewardTokens,
    reason: String(parsed.reason || `評分 ${score} 分。`).slice(0, 200),
    diagnosis: {
      errorStep: cleanField(parsed.error_step),
      misconception: cleanField(parsed.misconception),
      detail: cleanField(parsed.diagnosis),
      hint: cleanField(parsed.hint),
      followup: cleanField(parsed.followup_question)
    },
    mode: "claude-diagnosis"
  };
}

function gradeAnswer({ question, answer, difficulty, subject }) {
  const normalized = answer.replace(/\s+/g, " ").trim();
  const answerLength = normalized.length;
  const lengthScore = Math.min(30, Math.floor(answerLength / 5));
  const structureScore = /(首先|接著|然後|最後|步驟|因此|所以|因為|結論|1\.|2\.|一、|二、)/.test(normalized) ? 18 : 0;
  const evidenceScore = /(公式|代入|推導|例子|單位|檢查|定義|比較|原因|證明)/.test(normalized) ? 16 : 0;
  const subjectScore = scoreSubjectSignal(subject, normalized);
  const overlapScore = scoreOverlap(question, normalized);
  const shortPenalty = answerLength < 30 ? 18 : 0;
  const score = clamp(34 + lengthScore + structureScore + evidenceScore + subjectScore + overlapScore - shortPenalty, 0, 100);
  const isCorrect = score >= 70;
  const rewardTokens = isCorrect ? calculateReward(score, difficulty) : 0;

  return {
    is_correct: isCorrect,
    score,
    confidence: isCorrect ? 0.84 : 0.68,
    rewarded: isCorrect,
    rewardTokens,
    reason: buildReason({ isCorrect, score, answerLength, structureScore, evidenceScore, subjectScore }),
    diagnosis: null,
    mode: "rule-based-free"
  };
}

function scoreSubjectSignal(subject, answer) {
  const rubrics = {
    "數學": /(公式|代入|計算|化簡|配方|函數|圖形|證明|單位)/,
    "英文": /(文法|時態|主詞|受詞|子句|例句|翻譯|限定|非限定)/,
    "自然": /(實驗|變因|離子|能量|反應|觀察|定義|比較|單位)/,
    "社會": /(背景|原因|影響|制度|地理|時間|比較|證據)/,
    "國文": /(修辭|主旨|段落|語意|作者|例句|結構|情感)/
  };

  return rubrics[subject]?.test(answer) ? 12 : 0;
}

function scoreOverlap(question, answer) {
  const terms = Array.from(new Set(question.match(/[A-Za-z0-9]+|[一-鿿]{2,}/g) || []))
    .filter((term) => term.length >= 2)
    .slice(0, 10);
  const hits = terms.filter((term) => answer.includes(term)).length;
  return Math.min(12, hits * 3);
}

function buildReason({ isCorrect, score, answerLength, structureScore, evidenceScore, subjectScore }) {
  if (isCorrect) {
    const strengths = [];
    if (structureScore) strengths.push("步驟清楚");
    if (evidenceScore) strengths.push("有推導或例子");
    if (subjectScore) strengths.push("符合科目關鍵概念");
    return `評分 ${score} 分，${strengths.length ? strengths.join("、") : "內容完整度達標"}。`;
  }

  const suggestions = [];
  if (answerLength < 30) suggestions.push("答案太短");
  if (!structureScore) suggestions.push("補上步驟順序");
  if (!evidenceScore) suggestions.push("加入公式、定義或例子");
  return `評分 ${score} 分，${suggestions.join("，") || "需要更完整的推理"}。`;
}

function calculateReward(score, difficulty) {
  const base = 10;
  const quality = clamp(score / 80, 0.5, 1.5);
  const difficultyMultiplier = {
    junior: 1,
    senior: 1.5,
    college: 2
  }[difficulty] || 1;

  return Number((base * quality * difficultyMultiplier).toFixed(1));
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
  return text.slice(0, 600);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS
  });
}
