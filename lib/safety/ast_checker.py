import ast
import sys
import json

def check_code(code_str, allowed_modules, banned_modules, banned_calls, expected_entrypoint=None):
    violations = []
    checks = []

    # 1. File Size Check (< 64 KiB)
    byte_size = len(code_str.encode('utf-8'))
    if byte_size > 65536:
        violations.append(f"Security: Code size ({byte_size} bytes) exceeds the 64 KiB sandbox limit.")
        checks.append({"name": "File Size Limit", "status": "FAIL", "detail": f"{byte_size} bytes > 64 KiB"})
    else:
        checks.append({"name": "File Size Limit", "status": "PASS", "detail": f"{byte_size} bytes <= 64 KiB"})

    # 2. Syntax & AST Parsing
    try:
        tree = ast.parse(code_str)
        checks.append({"name": "Python Syntax & AST Parse", "status": "PASS", "detail": "Valid Python AST"})
    except SyntaxError as e:
        msg = f"Python Syntax Error: {e.msg} at line {e.lineno}"
        violations.append(msg)
        checks.append({"name": "Python Syntax & AST Parse", "status": "FAIL", "detail": msg})
        return violations, checks

    # 3. Entrypoint Signature Check
    if expected_entrypoint:
        found_entry = False
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name == expected_entrypoint:
                found_entry = True
                break
        if not found_entry:
            violations.append(f"Contract: Expected entrypoint function '{expected_entrypoint}' was not found.")
            checks.append({"name": "Entrypoint Signature", "status": "FAIL", "detail": f"Missing {expected_entrypoint}()"})
        else:
            checks.append({"name": "Entrypoint Signature", "status": "PASS", "detail": f"Found {expected_entrypoint}()"})
    else:
        checks.append({"name": "Entrypoint Signature", "status": "PASS", "detail": "Universal entrypoint format"})

    # 4. AST Traversal for Banned Modules, Dangerous Calls, and Unbounded Loops
    has_banned_import = False
    has_banned_call = False
    has_infinite_loop = False

    for node in ast.walk(tree):
        # Imports Check
        if isinstance(node, ast.Import):
            for n in node.names:
                root = n.name.split('.')[0]
                if root in banned_modules:
                    violations.append(f"AST: Prohibited import '{n.name}'")
                    has_banned_import = True
                elif root not in allowed_modules and n.name not in allowed_modules:
                    violations.append(f"AST: Unauthorized import '{n.name}'")
                    has_banned_import = True
        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            root = mod.split('.')[0]
            if root in banned_modules:
                violations.append(f"AST: Prohibited import from '{mod}'")
                has_banned_import = True
            elif root not in allowed_modules and mod not in allowed_modules:
                violations.append(f"AST: Unauthorized import from '{mod}'")
                has_banned_import = True

        # Dangerous Call Check
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                if node.func.id in banned_calls:
                    violations.append(f"AST: Prohibited function call '{node.func.id}()'")
                    has_banned_call = True
            elif isinstance(node.func, ast.Attribute):
                if node.func.attr in banned_calls or node.func.attr.startswith("__"):
                    violations.append(f"AST: Prohibited attribute call '{node.func.attr}()'")
                    has_banned_call = True

        # Unbounded Loop Check: while True / while 1 without break
        elif isinstance(node, ast.While):
            is_constant_true = False
            if isinstance(node.test, ast.Constant) and bool(node.test.value) is True:
                is_constant_true = True
            elif isinstance(node.test, ast.Name) and node.test.id == "True":
                is_constant_true = True

            if is_constant_true:
                has_break = any(isinstance(sub, ast.Break) for sub in ast.walk(node))
                if not has_break:
                    violations.append("AST: Unbounded 'while True' infinite loop detected without break statement.")
                    has_infinite_loop = True

    checks.append({
        "name": "Scientific Import Whitelist",
        "status": "FAIL" if has_banned_import else "PASS",
        "detail": "Only numpy, torch, math, scipy, gymnasium permitted"
    })
    checks.append({
        "name": "Forbidden Primitives Sandbox",
        "status": "FAIL" if has_banned_call else "PASS",
        "detail": "Bans os, sys, subprocess, eval, exec, socket, open"
    })
    checks.append({
        "name": "Loop Termination Heuristic",
        "status": "FAIL" if has_infinite_loop else "PASS",
        "detail": "Bans unbounded while True loops without break"
    })

    return violations, checks

if __name__ == "__main__":
    try:
        raw_input = sys.stdin.read()
        if not raw_input.strip():
            sys.exit(0)
        data = json.loads(raw_input)
        code = data.get("code", "")
        allowed = set(data.get("allowed", []))
        banned = set(data.get("banned", []))
        banned_calls = set(data.get("banned_calls", []))
        expected_entry = data.get("expected_entrypoint")

        violations, checks = check_code(code, allowed, banned, banned_calls, expected_entry)

        output = {
            "passed": len(violations) == 0,
            "violations": violations,
            "checks": checks
        }

        print(json.dumps(output))
        if violations:
            sys.exit(1)
        sys.exit(0)
    except Exception as e:
        print(json.dumps({
            "passed": False,
            "violations": [f"Checker Internal Error: {str(e)}"],
            "checks": []
        }))
        sys.exit(1)
