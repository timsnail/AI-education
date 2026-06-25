# 知鏈學習平台 MVP

這是一個零付費服務依賴的 Learn-to-Earn 教育平台 MVP，依白皮書收斂出第一階段可上線版本：

- 知識問答：發布題目、提交詳解、採納最佳解答。
- 學習筆記：分享讀書筆記並累積 EDU 點數。
- EDU 兌換商城：以瀏覽器資料模擬文具、課程、公益捐贈與學習歷程報告兌換。
- 信譽與 DID 分層：以 MVP 方式呈現 L0-L3 身份和信譽進度。
- AI 家教診斷：`/api/grade-and-reward` 在設定 `ANTHROPIC_API_KEY` 後，改用 Claude 做蘇格拉底式診斷——指出「錯在哪一步」、命名迷思概念、給提示與一題同概念練習題，**不直接給答案**。未設金鑰時自動退回免費規則式評分，所以無金鑰也能展示。

## 啟用 AI 診斷（Claude）

1. 取得 Anthropic API Key（platform.claude.com）。
2. 設為 Cloudflare 機密（不要寫進程式碼）：

   ```bash
   npx wrangler pages secret put ANTHROPIC_API_KEY
   ```

   本機測試可改用 `.dev.vars` 檔（內含 `ANTHROPIC_API_KEY=sk-ant-...`，已被 .gitignore 忽略）。
3. （選用）設 `GRADER_MODEL` 切換模型：預設 `claude-opus-4-8`（最準）；正式上線要壓成本/延遲可設 `claude-haiku-4-5` 或 `claude-sonnet-4-6`。每次診斷都是一次 API 呼叫，請用免費層的每日題數上限控管成本。

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
