@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  高校课程协作与评审平台
echo ============================================
if not exist data\db.json (
  echo 首次运行，正在生成演示数据...
  node seed.js
)
node server.js
pause
