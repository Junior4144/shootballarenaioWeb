@echo off
setlocal
set "CLOUDSDK_ACTIVE_CONFIG_NAME=shootball-arena"
set "CLOUDSDK_CORE_ACCOUNT=gbjunior010@gmail.com"
set "CLOUDSDK_CORE_PROJECT=project-7915787f-37b2-4286-aa7"
if "%GITHUB_ACTIONS%"=="true" goto ci
if not exist "%LOCALAPPDATA%\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd" goto missing
call "%LOCALAPPDATA%\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd" %*
exit /b %ERRORLEVEL%
:ci
rem GitHub's setup-gcloud action installs the SDK on PATH. OIDC supplies a
rem temporary credential override; no user credential or JSON key is uploaded.
set "SHOOTBALL_GCLOUD_BIN="
for /f "delims=" %%G in ('where gcloud.cmd 2^>nul') do if not defined SHOOTBALL_GCLOUD_BIN set "SHOOTBALL_GCLOUD_BIN=%%G"
if not defined SHOOTBALL_GCLOUD_BIN goto missing
call "%SHOOTBALL_GCLOUD_BIN%" %*
exit /b %ERRORLEVEL%
:missing
echo Google Cloud SDK not found in the expected installation directory. 1>&2
exit /b 1
