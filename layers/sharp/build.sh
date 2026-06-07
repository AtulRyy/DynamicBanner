#!/usr/bin/env bash
# Installs Sharp for Linux x64 (the Lambda runtime environment).
# Run this once before `sam build`.
set -e

echo "Building Sharp layer for Linux x64..."
npm install \
  --platform=linux \
  --arch=x64 \
  --libc=glibc
echo "Sharp layer ready at layers/sharp/node_modules"
