export async function onRequest(context) {
  return new Response("API is working!");
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { question, answer } = body;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${context.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "你是老師，只回答 JSON，不要多餘文字。"
          },
          {
            role: "user",
            content: `
題目：${question}
學生答案：${answer}

請判斷是否正確，並只回傳 JSON：
{
  "is_correct": true,
  "score": 0,
  "reason": "簡短說明"
}
`
          }
        ]
      })
    });

    const aiData = await aiRes.json();
    console.log("OpenAI 回傳：", JSON.stringify(aiData));

    if (!aiRes.ok) {
      return Response.json(
        {
          success: false,
          error: aiData.error?.message || "OpenAI API 呼叫失敗",
          raw: aiData
        },
        { status: 500 }
      );
    }

    if (!aiData.choices || !aiData.choices[0]?.message?.content) {
      return Response.json(
        {
          success: false,
          error: "OpenAI 回傳格式不符合預期",
          raw: aiData
        },
        { status: 500 }
      );
    }

    const text = aiData.choices[0].message.content;
    const result = JSON.parse(text);

    return Response.json({
      success: true,
      ...result,
      confidence: 0.95,
      rewarded: result.is_correct,
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