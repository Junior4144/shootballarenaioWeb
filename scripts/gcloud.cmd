@echo off
setlocal
set "CLOUDSDK_ACTIVE_CONFIG_NAME=shootball-arena"
set "CLOUDSDK_CORE_ACCOUNT=gbjunior010@gmail.com"
set "CLOUDSDK_CORE_PROJECT=project-7915787f-37b2-4286-aa7"
if not exist "%LOCALAPPDATA%\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd" goto missing
call "%LOCALAPPDATA%\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd" %*
exit /b %ERRORLEVEL%
:missing
echo Google Cloud SDK not found in the expected installation directory. 1>&2
exit /b 1
