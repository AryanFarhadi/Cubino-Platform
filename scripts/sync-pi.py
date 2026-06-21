import subprocess
import sys

ROOT = r"c:\Users\aryan\Desktop\cubino"
EXCLUDE = ["node_modules", ".git", ".turbo", "apps/web/.next", "apps/server/dist", ".env"]
ex = " ".join(f"--exclude={e}" for e in EXCLUDE)
tar_cmd = f'tar {ex} -czf - -C "{ROOT.replace(chr(92), "/")}" .'
p1 = subprocess.Popen(tar_cmd, shell=True, stdout=subprocess.PIPE)
p2 = subprocess.Popen(
    ["ssh", "aryan@192.168.1.100", "mkdir -p /home/aryan/cubino && tar xzf - -C /home/aryan/cubino"],
    stdin=p1.stdout,
)
p1.stdout.close()  # type: ignore
rc = p2.wait()
sys.exit(rc)
