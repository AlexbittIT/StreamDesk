@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title StreamDesk Agent - Server

if not defined STREAMDESK_URL (
  set /p "STREAMDESK_URL=CRM URL [http://localhost:5000]: "
  if not defined STREAMDESK_URL set "STREAMDESK_URL=http://localhost:5000"
)

if not defined STREAMDESK_AGENT_TOKEN (
  echo If the CRM server has STREAMDESK_AGENT_TOKEN, paste it now. Otherwise press Enter.
  set /p "STREAMDESK_AGENT_TOKEN=Agent token [empty]: "
)

if not defined STREAMDESK_COMPANY_ID (
  echo If you downloaded the agent from a company workspace this is already filled. Otherwise press Enter for local/dev mode.
  set /p "STREAMDESK_COMPANY_ID=Company ID [empty]: "
)

if not defined STREAMDESK_WORKSPACE_KEY (
  echo Paste the company monitoring workspace key if token auth is not used. Otherwise press Enter.
  set /p "STREAMDESK_WORKSPACE_KEY=Workspace key [empty]: "
)

if not defined STREAMDESK_AGENT_LOCATION set "STREAMDESK_AGENT_LOCATION=Auto server"
if not defined STREAMDESK_AGENT_INTERVAL_SEC set "STREAMDESK_AGENT_INTERVAL_SEC=15"
set "STREAMDESK_AGENT_TYPE=server"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\streamdesk-agent.ps1"
pause
