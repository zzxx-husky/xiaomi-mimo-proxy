#!/usr/bin/env python3
"""
Xiaomi MiMo Proxy 管理脚本
支持启动、停止、重启、状态检查
"""

import os
import sys
import signal
import subprocess
import time
import json
import urllib.request
from pathlib import Path

class ProxyManager:
    def __init__(self):
        self.project_dir = Path(__file__).parent.absolute()
        self.pid_file = self.project_dir / "proxy.pid"
        self.log_dir = self.project_dir / "logs"
        self.log_file = self.log_dir / f"proxy-{time.strftime('%Y-%m-%d')}.log"
        self.port = 3000

    def log(self, message, level="INFO"):
        timestamp = time.strftime('%Y-%m-%d %H:%M:%S')
        print(f"[{timestamp}] [{level}] {message}")

    def get_pid(self):
        """获取PID"""
        if self.pid_file.exists():
            try:
                return int(self.pid_file.read_text().strip())
            except:
                return None
        return None

    def is_running(self):
        """检查是否在运行"""
        pid = self.get_pid()
        if pid is None:
            return False

        try:
            # 检查进程是否存在
            if sys.platform == 'win32':
                result = subprocess.run(['tasklist', '/FI', f'PID eq {pid}'],
                                      capture_output=True, text=True)
                return str(pid) in result.stdout
            else:
                os.kill(pid, 0)
                return True
        except:
            return False

    def get_port_pid(self):
        """获取占用端口的进程PID"""
        try:
            if sys.platform == 'win32':
                result = subprocess.run(['netstat', '-ano'], capture_output=True, text=True)
                for line in result.stdout.split('\n'):
                    if f':{self.port} ' in line and 'LISTENING' in line:
                        parts = line.split()
                        if len(parts) >= 5:
                            return int(parts[-1])
            else:
                result = subprocess.run(['lsof', '-i', f':{self.port}'], capture_output=True, text=True)
                for line in result.stdout.split('\n')[1:]:
                    if line:
                        parts = line.split()
                        if len(parts) >= 2:
                            return int(parts[1])
        except:
            pass
        return None

    def kill_process(self, pid):
        """杀死进程"""
        try:
            if sys.platform == 'win32':
                subprocess.run(['taskkill', '/F', '/PID', str(pid)],
                             capture_output=True)
            else:
                os.kill(pid, signal.SIGTERM)
                time.sleep(1)
                try:
                    os.kill(pid, signal.SIGKILL)
                except:
                    pass
            return True
        except:
            return False

    def start(self):
        """启动Proxy"""
        self.log_dir.mkdir(exist_ok=True)

        if self.is_running():
            self.log("Proxy已在运行", "WARN")
            return True

        # 检查端口占用
        port_pid = self.get_port_pid()
        if port_pid:
            self.log(f"端口{self.port}被占用 (PID: {port_pid})，正在释放...", "WARN")
            self.kill_process(port_pid)
            time.sleep(2)

        # 检查依赖
        if not (self.project_dir / "node_modules").exists():
            self.log("安装依赖...", "INFO")
            subprocess.run(['npm', 'install'], cwd=self.project_dir, check=True)

        # 启动进程
        self.log("启动Proxy服务器...", "INFO")

        with open(self.log_file, 'w') as log_f:
            if sys.platform == 'win32':
                process = subprocess.Popen(
                    ['node', 'src/index.js'],
                    cwd=self.project_dir,
                    stdout=log_f,
                    stderr=log_f,
                    creationflags=subprocess.CREATE_NO_WINDOW
                )
            else:
                process = subprocess.Popen(
                    ['node', 'src/index.js'],
                    cwd=self.project_dir,
                    stdout=log_f,
                    stderr=log_f,
                    start_new_session=True
                )

        # 保存PID
        self.pid_file.write_text(str(process.pid))

        # 等待启动
        time.sleep(3)

        # 检查是否启动成功
        if self.is_running():
            self.log(f"Proxy启动成功 PID: {process.pid}", "INFO")
            return True
        else:
            self.log("Proxy启动失败", "ERROR")
            self.pid_file.unlink(missing_ok=True)
            return False

    def stop(self):
        """停止Proxy"""
        self.log("停止Proxy服务器...", "INFO")

        # 停止PID文件中的进程
        pid = self.get_pid()
        if pid and self.is_running():
            self.log(f"停止进程 PID: {pid}", "INFO")
            self.kill_process(pid)
            time.sleep(1)

        # 清理PID文件
        self.pid_file.unlink(missing_ok=True)

        # 检查端口占用
        port_pid = self.get_port_pid()
        if port_pid:
            self.log(f"释放端口{self.port} PID: {port_pid}", "INFO")
            self.kill_process(port_pid)
            time.sleep(1)

        self.log("Proxy已停止", "INFO")
        return True

    def restart(self):
        """重启Proxy"""
        self.log("重启Proxy服务器...", "INFO")
        self.stop()
        time.sleep(2)
        return self.start()

    def status(self):
        """检查状态"""
        self.log("Proxy状态检查", "INFO")

        if self.is_running():
            pid = self.get_pid()
            self.log(f"✅ Proxy正在运行 PID: {pid}", "INFO")

            # 健康检查
            try:
                url = f"http://localhost:{self.port}/health"
                req = urllib.request.Request(url)
                with urllib.request.urlopen(req, timeout=5) as response:
                    if response.status == 200:
                        data = json.loads(response.read())
                        self.log(f"✅ 健康检查正常 缓存: {data['cacheStats']['cacheSize']}", "INFO")
                    else:
                        self.log("❌ 健康检查异常", "ERROR")
            except:
                self.log("❌ 健康检查无响应", "ERROR")
        else:
            self.log("❌ Proxy未运行", "ERROR")

        self.log(f"日志: {self.log_file}", "INFO")

    def logs(self, lines=50):
        """查看日志"""
        if not self.log_file.exists():
            self.log("日志文件不存在", "ERROR")
            return

        with open(self.log_file, 'r', encoding='utf-8') as f:
            all_lines = f.readlines()
            for line in all_lines[-lines:]:
                print(line, end='')

def main():
    if len(sys.argv) < 2:
        print("用法: python proxy.py <command>")
        print("命令:")
        print("  start   - 启动Proxy")
        print("  stop    - 停止Proxy")
        print("  restart - 重启Proxy")
        print("  status  - 查看状态")
        print("  logs    - 查看日志")
        sys.exit(1)

    manager = ProxyManager()
    command = sys.argv[1].lower()

    if command == 'start':
        success = manager.start()
        sys.exit(0 if success else 1)
    elif command == 'stop':
        success = manager.stop()
        sys.exit(0 if success else 1)
    elif command == 'restart':
        success = manager.restart()
        sys.exit(0 if success else 1)
    elif command == 'status':
        manager.status()
    elif command == 'logs':
        lines = int(sys.argv[2]) if len(sys.argv) > 2 else 50
        manager.logs(lines)
    else:
        print(f"未知命令: {command}")
        sys.exit(1)

if __name__ == '__main__':
    main()
