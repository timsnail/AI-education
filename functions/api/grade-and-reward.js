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
            content: `
你是一位非常嚴格的數學閱卷老師。

你的工作流程必須是：
1. 先根據題目自行解題，求出正確答案。
2. 再比較學生答案是否與正確答案一致。
3. 若學生答案與正確答案不一致，is_correct 必須為 false。
4. 若答案錯誤，score 必須低於 60。
5. 只回傳 JSON，不可以回傳其他文字。

JSON 格式如下：
{
  "correct_answer": "正確答案",
  "student_answer": "學生答案",
  "is_correct": true,
  "score": 100,
  "reason": "簡短說明"
}
`
          },
          {
            role: "user",
            content: `
題目：${question}
學生答案：${answer}

請先解題，再嚴格比較學生答案是否與正確答案一致。
如果不一致，必須判錯。
只回傳 JSON。
`
          }
        ]
      }
    );

    let text = aiResult.response;
    text = text.replace(/```json|```/g, "").trim();

    const parsed = JSON.parse(text);

    return Response.json({
      success: true,
      ...parsed,
      confidence: parsed.is_correct ? 0.9 : 0.85,
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
