# 知鏈學習平台 MVP

這是一個零付費服務依賴的 Learn-to-Earn 教育平台 MVP，依白皮書收斂出第一階段可上線版本：

- 知識問答：發布題目、提交詳解、採納最佳解答。
- 學習筆記：分享讀書筆記並累積 EDU 點數。
- EDU 兌換商城：以瀏覽器資料模擬文具、課程、公益捐贈與學習歷程報告兌換。
- 信譽與 DID 分層：以 MVP 方式呈現 L0-L3 身份和信譽進度。
- Cloudflare Pages Function：`/api/grade-and-reward` 使用免費規則式評分，不需要 OpenAI API Key。

## 本機預覽

直接開啟 `public/index.html` 可以使用前端功能；若要連同 Cloudflare Function 一起測試：

```bash
npx wrangler pages dev public --functions functions
```

## Cloudflare 免費部署

建議使用 Git 整合或 Wrangler，因為 Cloudflare 官方文件指出拖拉上傳不會編譯 `functions` 目錄。

1. 將專案推到 GitHub。
2. Cloudflare Dashboard -> Workers & Pages -> Create application -> Pages -> Connect to Git。
3. Build command 留空或填 `exit 0`。
4. Build output directory 設為 `public`。
5. 部署後 API 會在 `/api/grade-and-reward`。

也可以使用 Wrangler：

```bash
npx wrangler pages deploy public
```

官方參考：

- Cloudflare Pages build configuration: https://developers.cloudflare.com/pages/configuration/build-configuration/
- Cloudflare Pages Functions: https://developers.cloudflare.com/pages/functions/get-started/
- Cloudflare Pages Direct Upload: https://developers.cloudflare.com/pages/get-started/direct-upload/

## 後續升級路線

第一版資料存在使用者瀏覽器，適合提案展示與早期測試。要做多人共用資料時，下一步建議接 Cloudflare D1。Cloudflare D1 Free 方案目前可建立 10 個資料庫、單庫 500 MB、帳號總儲存 5 GB，可支撐早期問答資料。
