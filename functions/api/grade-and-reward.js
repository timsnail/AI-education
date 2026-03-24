export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { question, answer } = body;

    const aiResult = await context.env.AI.run(
      "@cf/meta/llama-3-8b-instruct",
      {
        messages: [
          {
            role: "system",
            content: "你是老師，只回答JSON，不要多餘文字"
          },
          {
            role: "user",
            content: `
題目：${question}
學生答案：${answer}

請只回傳JSON：
{
  "is_correct": true,
  "score": 0~100,
  "reason": "簡短說明"
}
`
          }
        ]
      }
    );

    // 👉 Cloudflare AI 回傳
    let text = aiResult.response;

    // ⚠️ 去掉 ```json 包裝
    text = text.replace(/```json|```/g, "").trim();

    const parsed = JSON.parse(text);

    return Response.json({
      success: true,
      ...parsed,
      confidence: 0.9,
      rewarded: parsed.is_correct,
      txHash: null
    });

  } catch (err) {
    return Response.json(
      {
        success: false,
        error: err.message
      },
      { status: 500 }
    );
  }
}