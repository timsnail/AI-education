# 知鏈學習平台 MVP

這是一個零付費服務依賴的 Learn-to-Earn 教育平台 MVP，依白皮書收斂出第一階段可上線版本：

- 知識問答：發布題目、提交詳解、採納最佳解答。
- 學習筆記：分享讀書筆記並累積 EDU 點數。
- EDU 兌換商城：以瀏覽器資料模擬文具、課程、公益捐贈與學習歷程報告兌換。
- 信譽與 DID 分層：以 MVP 方式呈現 L0-L3 身份和信譽進度。
- AI 家教診斷：`/api/grade-and-reward` 會做蘇格拉底式診斷——指出「錯在哪一步」、命名迷思概念、給提示與一題同概念練習題，**不直接給答案**。

## AI 診斷的三段式 fallback

endpoint 會依序挑可用的後端，所以任何環境都能跑：

1. **Claude**（若設定 `ANTHROPIC_API_KEY`）— 品質最佳，付費。
2. **Cloudflare Workers AI**（若有 `AI` binding）— **免費額度**，預設 Qwen3 中文模型，無需金鑰。
3. **規則式評分** — 零依賴 fallback，前兩者都沒有時使用。

### 啟用免費的 Workers AI（推薦，免金鑰）

`wrangler.toml` 已加好 `[ai]` binding。用 Git 連結部署時：

- 多數情況部署後 binding 會自動生效；若 `/api/grade-and-reward` 的 `mode` 還是 `rule-based-free`，到 Cloudflare 後台該 Pages 專案 → **Settings → Bindings → Add → Workers AI**，變數名稱填 `AI`，再 **Retry deployment**。
- （選用）設環境變數 `WORKERS_AI_MODEL` 切模型；要更省 Neurons 可用 `@cf/meta/llama-3.1-8b-instruct`。免費額度為每天 10,000 Neurons。

### 啟用 Claude（選用升級）

設 `ANTHROPIC_API_KEY`（Cloudflare Secret，或本機 `.dev.vars`，已被 .gitignore 忽略），即自動優先用 Claude。可用 `GRADER_MODEL` 切 `claude-haiku-4-5` / `claude-sonnet-4-6` 壓成本。

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
