# Camera OCR Web App

カメラ映像から文字を抽出し、テキストをコピーできるWebアプリです。

## 機能

- カメラ起動 / 停止
- 撮影してOCR実行
- 日本語 + 英語 OCR（切替可）
- 認識結果のワンクリックコピー

## ローカル実行

1. このフォルダで簡易サーバーを起動

```powershell
# Pythonがある場合
python -m http.server 8080
```

2. ブラウザで以下を開く

- http://localhost:8080

## GitHub + Render で公開（HTTPS）

1. GitHubで新規リポジトリを作成し、コードをpush

```powershell
git init
git add .
git commit -m "feat: camera OCR web app"
git branch -M main
git remote add origin https://github.com/<your-name>/<repo>.git
git push -u origin main
```

2. Renderにログイン
3. New + から Blueprint を選択
4. GitHubリポジトリを選択
5. render.yaml を検出してデプロイ
6. デプロイ完了後、https のURLでアクセス

## 注意

- 初回OCR時に言語データの読み込みで少し時間がかかる場合があります。
- カメラ権限が拒否されると利用できません。
- スマホはHTTPS環境での動作を推奨します。
