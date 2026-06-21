#!/bin/bash
python3 << 'PY'
import json, urllib.request
data = json.dumps({
    "email": "good@cubino.ir",
    "username": "gooduser1",
    "password": "password123",
    "displayName": "Good"
}).encode()
req = urllib.request.Request(
    "http://127.0.0.1/api/v1/auth/register",
    data=data,
    headers={"Content-Type": "application/json", "Host": "cubino.ir"},
    method="POST",
)
try:
    with urllib.request.urlopen(req) as r:
        print(r.read().decode())
except Exception as e:
    if hasattr(e, "read"):
        print(e.read().decode())
    else:
        print(e)
