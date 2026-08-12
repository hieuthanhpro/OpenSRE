#!/usr/bin/env python3
"""
Oracle Live Database Connection Runner (OpenSRE Driver Core)
--------------------------------------------------------------
Base database connection runner that handles authentication and executes
read-only SELECT/WITH SQL queries against Oracle DB.
Credentials are loaded strictly from environment variables (.env).

Usage:
    python query_oracle.py --query "SELECT * FROM V$SESSION WHERE STATUS='ACTIVE'"
    python query_oracle.py --sql-id <SQL_ID>
    python query_oracle.py --query "SELECT ..." --json
"""

import argparse
import json
import os
import sys

def get_db_connection():
    """Get Oracle database connection using oracledb or cx_Oracle."""
    host = os.environ.get("ORACLE_DB_HOST")
    port_env = os.environ.get("ORACLE_DB_PORT")
    port = int(port_env) if port_env else None
    user = os.environ.get("ORACLE_DB_USER")
    password = os.environ.get("ORACLE_DB_PASSWORD")
    service_name = os.environ.get("ORACLE_DB_SERVICE")

    if not all([host, port, user, password, service_name]):
        print("Error: Missing required Oracle DB environment variables (ORACLE_DB_HOST, ORACLE_DB_PORT, ORACLE_DB_USER, ORACLE_DB_PASSWORD, ORACLE_DB_SERVICE). Please set them in .env.", file=sys.stderr)
        sys.exit(1)

    # Try oracledb first
    try:
        import oracledb
        client_dir = os.environ.get("ORACLE_CLIENT_DIR", "/opt/oracle/instantclient")
        if os.path.exists(client_dir):
            try:
                oracledb.init_oracle_client(lib_dir=client_dir)
            except Exception:
                pass
        conn = oracledb.connect(user=user, password=password, host=host, port=port, service_name=service_name)
        return conn
    except Exception as e1:
        # Try cx_Oracle as fallback
        try:
            import cx_Oracle
            dsn = cx_Oracle.makedsn(host, port, service_name=service_name)
            conn = cx_Oracle.connect(user=user, password=password, dsn=dsn)
            return conn
        except Exception as e2:
            print(f"Error connecting to Oracle DB ({host}:{port}/{service_name}): {e1} | Fallback: {e2}", file=sys.stderr)
            sys.exit(1)

def execute_read_only_query(sql_query, as_json=False):
    """Safely execute a read-only SELECT query against the Oracle Database."""
    cleaned_sql = sql_query.strip().upper()
    if not (cleaned_sql.startswith("SELECT") or cleaned_sql.startswith("WITH")):
        print("Security Error: Only SELECT / WITH queries are permitted for safety.", file=sys.stderr)
        sys.exit(1)

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(sql_query)
        columns = [col[0] for col in cursor.description]
        rows = cursor.fetchall()

        if as_json:
            result = [dict(zip(columns, [str(val) if val is not None else "" for val in row])) for row in rows]
            print(json.dumps(result, indent=2, default=str))
        else:
            print(f"=== Oracle Query Results ({len(rows)} rows) ===")
            print("| " + " | ".join(columns) + " |")
            print("| " + " | ".join(["---"] * len(columns)) + " |")
            for r in rows:
                r_str = [str(val) if val is not None else "" for val in r]
                print("| " + " | ".join(r_str) + " |")
    except Exception as e:
        print(f"Query execution failed: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()

def main():
    parser = argparse.ArgumentParser(description="Oracle Live DB Pure Query Runner")
    parser.add_argument("--query", "-q", help="Execute read-only SELECT query")
    parser.add_argument("--sql-id", help="Inspect specific SQL_ID details from V$SQLAREA")
    parser.add_argument("--json", action="store_true", help="Output results in JSON format")
    args = parser.parse_args()

    sql_to_run = None
    if args.sql_id:
        sql_to_run = f"""
            SELECT sql_id, executions,
                   ROUND(cpu_time / 1000000, 2) AS cpu_sec,
                   ROUND(elapsed_time / 1000000, 2) AS elapsed_sec,
                   buffer_gets, disk_reads, sharable_mem, optimizer_cost, sql_fulltext
            FROM v$sqlarea
            WHERE sql_id = '{args.sql_id}'
        """
    elif args.query:
        sql_to_run = args.query
    else:
        sql_to_run = "SELECT instance_name, host_name, status, version FROM v$instance"

    execute_read_only_query(sql_to_run, as_json=args.json)

if __name__ == "__main__":
    main()
