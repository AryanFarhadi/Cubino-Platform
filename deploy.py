import os
import subprocess
import sys

HOST = "192.168.1.100"
USER = "aryan"
PASSWORD = "8585"
REMOTE = f"{USER}@{HOST}"
REMOTE_DIR = "/home/aryan/cubino"
LOCAL_ROOT = os.path.dirname(os.path.abspath(__file__))
ASKPASS = os.path.join(LOCAL_ROOT, "ssh-askpass.bat")

EXCLUDE = [
    "node_modules",
    ".git",
    ".turbo",
    "apps/web/.next",
    "apps/server/dist",
    ".env",
]


def ssh_env():
    env = os.environ.copy()
    env["SSH_ASKPASS"] = ASKPASS
    env["SSH_ASKPASS_REQUIRE"] = "force"
    env["DISPLAY"] = "1"
    return env


def run(cmd, *, check=True, capture=False):
    print(f">>> {cmd}")
    result = subprocess.run(
        cmd,
        shell=True,
        env=ssh_env(),
        text=True,
        capture_output=capture,
        check=False,
    )
    if result.stdout:
        print(result.stdout, end="" if result.stdout.endswith("\n") else "\n")
    if result.stderr:
        print(result.stderr, end="" if result.stderr.endswith("\n") else "\n")
    if check and result.returncode != 0:
        sys.exit(result.returncode)
    return result


def ensure_ssh_key():
    key = os.path.expanduser("~/.ssh/id_ed25519")
    pub = key + ".pub"
    if not os.path.exists(key):
        run(f'ssh-keygen -t ed25519 -N "" -f "{key}" -q', check=True)

    probe = run(
        f'ssh -o BatchMode=yes -o ConnectTimeout=5 {REMOTE} "echo KEY_OK"',
        check=False,
        capture=True,
    )
    if probe.returncode == 0 and "KEY_OK" in (probe.stdout or ""):
        return

    pub_data = open(pub, encoding="utf-8").read().strip()
    run(
        f'ssh -o StrictHostKeyChecking=no {REMOTE} '
        f'"mkdir -p ~/.ssh && chmod 700 ~/.ssh && '
        f'grep -qxF \'{pub_data}\' ~/.ssh/authorized_keys 2>/dev/null || '
        f'echo \'{pub_data}\' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"',
        check=True,
    )


def sync_project():
    excludes = " ".join(f"--exclude={e}" for e in EXCLUDE)
    tar_cmd = (
        f'tar {excludes} -czf - '
        f'-C "{LOCAL_ROOT.replace(chr(92), "/")}" .'
    )
    run(
        f'{tar_cmd} | ssh {REMOTE} "mkdir -p {REMOTE_DIR} && tar xzf - -C {REMOTE_DIR}"'
    )


def main():
    ensure_ssh_key()

    run(f'ssh {REMOTE} "mkdir -p {REMOTE_DIR}"')
    print("Removing old static game site from Pi...")
    run(
        f'ssh {REMOTE} "rm -rf {REMOTE_DIR}/game /home/aryan/game 2>/dev/null; '
        f'pm2 delete cubino-arena 2>/dev/null || true"'
    )
    print("Syncing project to Pi...")
    sync_project()

    local_conf = os.path.join(LOCAL_ROOT, "nginx-cubino.conf")
    run(f'scp "{local_conf}" {REMOTE}:/tmp/cubino-nginx.conf')

    env_example = os.path.join(LOCAL_ROOT, ".env.example")
    run(
        f'ssh {REMOTE} '
        f'"test -f {REMOTE_DIR}/.env || cp {REMOTE_DIR}/.env.example {REMOTE_DIR}/.env"'
    )

    # Ensure production env for nginx same-origin + Cloudflare
    prod_env = (
        f"grep -q '^CORS_ORIGIN=' {REMOTE_DIR}/.env 2>/dev/null || "
        f"echo 'CORS_ORIGIN=https://cubino.ir,http://192.168.1.100,http://localhost' >> {REMOTE_DIR}/.env; "
        f"sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=https://cubino.ir,http://192.168.1.100,http://localhost|' {REMOTE_DIR}/.env; "
        f"grep -q '^NODE_ENV=' {REMOTE_DIR}/.env || echo 'NODE_ENV=production' >> {REMOTE_DIR}/.env; "
        f"sed -i 's|^NODE_ENV=.*|NODE_ENV=production|' {REMOTE_DIR}/.env"
    )
    run(f'ssh {REMOTE} "{prod_env}"')

    sudo = f"echo '{PASSWORD}' | sudo -S"
    print("Running native deploy on Pi (install + build can take 15-25 min)...")
    print("  Progress log: ssh aryan@192.168.1.100 'tail -f /home/aryan/cubino/deploy.log'")
    deploy_cmds = (
        f"cd {REMOTE_DIR} && chmod +x scripts/deploy-native.sh && "
        f"nohup bash scripts/deploy-native.sh > deploy.log 2>&1 & echo DEPLOY_PID=$!"
    )
    result = run(f'ssh {REMOTE} "{deploy_cmds}"', check=False)
    pid_line = (result.stdout or "").strip()
    print(f"  Started background deploy: {pid_line}")
    print("  Waiting for services (polling up to 30 min)...")

    import time
    for i in range(60):
        time.sleep(30)
        check = run(
            f'ssh {REMOTE} "curl -s -o /dev/null -w %{{http_code}} http://127.0.0.1:3000/ 2>/dev/null; '
            f'tail -1 {REMOTE_DIR}/deploy.log 2>/dev/null"',
            check=False,
            capture=True,
        )
        out = (check.stdout or "").strip()
        print(f"  [{i+1}/60] {out}")
        if out.startswith("200") or out.startswith("307"):
            break
        if "Deploy complete" in out or "=== Deploy complete ===" in (check.stdout or ""):
            break
    else:
        print("  Deploy still running or failed — check log on Pi.")

    run(f'ssh {REMOTE} "{sudo} cp /tmp/cubino-nginx.conf /etc/nginx/sites-enabled/default"')
    run(f'ssh {REMOTE} "{sudo} nginx -t"')
    run(f'ssh {REMOTE} "{sudo} systemctl reload nginx"')

    run(f'ssh {REMOTE} "pm2 delete cubino-arena 2>/dev/null || true"')
    run(f'ssh {REMOTE} "pm2 save 2>/dev/null || true"')

    run(f'ssh {REMOTE} "curl -s -o /dev/null -w %{{http_code}} http://127.0.0.1/"')

    print(f"\nDone! Cubino live at http://{HOST}/ and https://cubino.ir/")


if __name__ == "__main__":
    main()
