# Empire Lords

Вебверсія фентезі-автобатлера з майбутньою Windows overlay-обгорткою.

## Поточний стан

Перший вертикальний зріз уже містить відтворюваний симулятор бою та вебекран, який показує його результат.

## Локальний запуск

```powershell
npm.cmd install
npm.cmd run dev
```

Відкрити адресу, яку покаже Vite (типово `http://localhost:5173`).

## Перевірки

```powershell
npm.cmd test
npm.cmd run build
```

## Публікація

Workflow `.github/workflows/deploy-pages.yml` збирає вебгру та публікує її в GitHub Pages після push у `main`. У налаштуваннях репозиторію потрібно один раз обрати **Settings → Pages → Source: GitHub Actions**.
