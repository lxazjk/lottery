#!/bin/zsh
set -e
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd -- "${0:A:h}"

if ! command -v node >/dev/null 2>&1; then
  echo "请先安装 Node.js 20 或更高版本，再双击启动。"
  read -k 1 "?按任意键关闭"
  exit 1
fi

if node -e 'fetch("http://127.0.0.1:9018/").then(r=>r.text()).then(d=>process.exit(d.includes("browser-v1") && d.includes("幸运盛典") ? 0:1)).catch(()=>process.exit(1))' 2>/dev/null; then
  open "http://127.0.0.1:9018/"
  exit 0
fi

if [[ ! -d product/node_modules ]]; then
  echo "首次使用，正在安装依赖…"
  npm run setup
fi

echo "正在准备幸运盛典…"
npm run build
./product/node_modules/.bin/vite preview --config product/vite.config.js --outDir product/dist &
lottery_pid=$!
trap 'kill "$lottery_pid" 2>/dev/null || true' EXIT INT TERM
for attempt in {1..30}; do
  if curl -fsS --max-time 1 http://127.0.0.1:9018/ >/dev/null 2>&1; then
    open "http://127.0.0.1:9018/"
    echo "活动已启动。请保留此终端窗口，关闭窗口会停止服务。"
    wait "$lottery_pid"
    exit 0
  fi
  if ! kill -0 "$lottery_pid" 2>/dev/null; then
    echo "启动失败，请检查上方提示，或确认 9018 端口未被其他程序占用。"
    read -k 1 "?按任意键关闭"
    exit 1
  fi
  sleep 0.25
done
echo "启动超时，请检查本地服务。"
read -k 1 "?按任意键关闭"
exit 1
