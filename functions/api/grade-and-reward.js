const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export async function onRequestGet() {
  return json({
    success: true,
    message: "grade-and-reward API is ready.",
    mode: "rule-based-free"
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
    reason: buildReason({ isCorrect, score, answerLength, structureScore, evidenceScore, subjectScore })
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
  const terms = Array.from(new Set(question.match(/[A-Za-z0-9]+|[\u4e00-\u9fff]{2,}/g) || []))
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

function cleanText(value) {
  return String(value || "").trim().slice(0, 5000);
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
