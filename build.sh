#!/bin/bash
./script-version-increment.sh SuperGoogleImages.user.js && \
  git push && \
  git push --tags
