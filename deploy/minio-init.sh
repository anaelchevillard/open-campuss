#!/bin/sh
set -eu
export HOME=/tmp
until mc alias set root http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do sleep 1; done
mc mb --ignore-existing root/campus
mc anonymous set none root/campus
mc ilm rule ls root/campus 2>/dev/null | grep -q uploads/ || mc ilm rule add --prefix uploads/ --expire-days 3 root/campus
cat > /tmp/policy.json <<'P'
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:ListBucket","s3:GetBucketLocation","s3:ListBucketMultipartUploads"],"Resource":["arn:aws:s3:::campus"]},
 {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:AbortMultipartUpload","s3:ListMultipartUploadParts"],"Resource":["arn:aws:s3:::campus/*"]}
]}
P
mc admin policy create root campus-app /tmp/policy.json
mc admin user add root campus-app "$S3_APP_SECRET"
mc admin policy attach root campus-app --user campus-app 2>/dev/null || true
# Compte de la copie vers le Drive : lecture seule, et seulement le préfixe drive/
if [ -n "${S3_DRIVE_SECRET:-}" ]; then
  cat > /tmp/drive-policy.json <<'P'
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:GetBucketLocation"],"Resource":["arn:aws:s3:::campus"]},
 {"Effect":"Allow","Action":["s3:ListBucket"],"Resource":["arn:aws:s3:::campus"],"Condition":{"StringLike":{"s3:prefix":["drive/*"]}}},
 {"Effect":"Allow","Action":["s3:GetObject"],"Resource":["arn:aws:s3:::campus/drive/*"]}
]}
P
  mc admin policy create root campus-drive /tmp/drive-policy.json
  mc admin user add root campus-drive "$S3_DRIVE_SECRET"
  mc admin policy attach root campus-drive --user campus-drive 2>/dev/null || true
fi
