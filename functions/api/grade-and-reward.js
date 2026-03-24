export async function onRequest(context) {
  return new Response("API is working!");
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const { answer, question } = body;

    // 呼叫 OpenAI
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "你是老師，只回答JSON，不要多餘文字",
          },
          {
            role: "user",
            content: `
題目：${question}
學生答案：${answer}

請判斷是否正確，並回傳JSON：
{
  "is_correct": true/false,
  "score": 0~100,
  "reason": "簡短說明"
}
`,
          },
        ],
      }),
    });

    const aiData = await aiRes.json();
    const text = aiData.choices[0].message.content;

    const result = JSON.parse(text);

    return Response.json({
      success: true,
      ...result,
      rewarded: result.is_correct,
      txHash: null,
    });

  } catch (err) {
    return Response.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
