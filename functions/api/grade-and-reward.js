export async function onRequest(context) {
  return new Response("API is working!");
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    return Response.json({
      success: true,
      received: body,
      is_correct: true,
      score: 100,
      confidence: 0.95,
      reason: "測試成功，這是假的 API 回應",
      rewarded: false,
      txHash: null
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}