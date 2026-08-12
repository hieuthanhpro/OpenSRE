import os
import glob
import re
from html.parser import HTMLParser

class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text = []
        self.skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.skip = True

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.skip = False

    def handle_data(self, data):
        if not self.skip:
            self.text.append(data)

def extract_tables(sql):
    tables = set()
    sql_clean = re.sub(r"'[^']*'", '', sql)
    sql_clean = re.sub(r'--.*', '', sql_clean)
    sql_clean = re.sub(r'/\*[\s\S]*?\*/', '', sql_clean)
    
    pattern = r'\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-zA-Z0-9_\$]+(?:\.[a-zA-Z0-9_\$]+)?)'
    matches = re.findall(pattern, sql_clean, re.IGNORECASE)
    
    stop_words = {'SELECT', 'DUAL', 'WHERE', 'SET', 'VALUES', 'AND', 'OR', 'ON', 'USING', 'GROUP', 'ORDER', 'HAVING', 'TABLE', 'SYS'}
    for m in matches:
        m_upper = m.upper().strip()
        if m_upper not in stop_words and not m_upper.isdigit():
            # Exclude user/environment specific custom tables
            if not m_upper.startswith('BINHTV.') and m_upper not in ('DDL_LOG', 'DEPARTMENT', 'EMPLOYEE', 'TABLE1'):
                tables.add(m_upper)
    return sorted(list(tables))

def is_valid_monitoring_sql(sql_txt):
    sql_upper = sql_txt.upper()
    
    # 1. Reject destructive / kill commands
    if 'KILL -9' in sql_upper or 'ALTER SYSTEM KILL SESSION' in sql_upper or 'KILL' in sql_upper:
        return False
        
    # 2. Reject queries targeting subjective/user-specific schema tables
    subjective_patterns = ['BINHTV.', 'TC_DBA_ACTION_LOG', 'TC_MONITOR', 'DBAMF_LOG_JOBS', 'DEPARTMENT', 'EMPLOYEE']
    if any(pat in sql_upper for pat in subjective_patterns):
        return False
        
    return True

def sanitize_generic_sql(sql_txt):
    """Remove hardcoded environment-specific filters (machine names, specific user BINHTV, specific server IPs/names)
    to make SQL queries 100% generic & applicable across all Oracle DB environments."""
    lines = sql_txt.split('\n')
    cleaned_lines = []
    
    for line in lines:
        l_upper = line.upper().strip()
        
        # Remove commented lines that reference specific individual environments/users
        if l_upper.startswith('--'):
            if any(k in l_upper for k in ['BINHTV', 'CRCSRV02', 'APP_OWNER', '4588', 'CCWG0NQR1ZBU7']):
                continue
                
        # Remove active WHERE filters targeting specific server machines or hardcoded usernames
        if 'MACHINE LIKE \'%CRCSRV02%\'' in l_upper or 'MACHINE LIKE \'%BINHTV%\'' in l_upper:
            continue
        if 'USERNAME LIKE \'BINHTV%\'' in l_upper or 'USERNAME LIKE \'APP_OWNER%\'' in l_upper:
            continue
            
        cleaned_lines.append(line)
        
    sql_result = '\n'.join(cleaned_lines).strip()
    
    # Clean author names from SQL comments
    sql_result = re.sub(r'/\*.*?(Trần Văn Bình|BINHTV|OraAZ).*?\*/', '/*', sql_result, flags=re.IGNORECASE)
    
    return sql_result

def generate_md():
    sqldir = '/root/RnD/OpenSRE/sqltunning'
    files = sorted(glob.glob(os.path.join(sqldir, '*.html')))
    
    report_lines = []
    report_lines.append('# BÁO CÁO TỔNG HỢP CÁC CÂU LỆNH SQL GIÁM SÁT & TỐI ƯU ORACLE DATABASE (CHUẨN HÓA DÙNG CHUNG CHOP MỌI DATABASE)')
    report_lines.append('_Đã chuẩn hóa 100%: Lọc bỏ các yếu tố chủ quan/khách quan riêng của tác giả (tên máy server, schema BINHTV, username cá nhân, lệnh kill). Áp dụng dùng chung cho mọi hệ thống Oracle Database._\n')
    
    global_tables = set()
    file_count = 0
    total_queries = 0

    for filepath in files:
        fname = os.path.basename(filepath)
        content = open(filepath, encoding='utf-8', errors='ignore').read()
        ext = TextExtractor()
        ext.feed(content)
        raw = '\n'.join(ext.text).replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&').replace('&nbsp;', ' ')
        
        lines = [line.strip() for line in raw.split('\n') if line.strip()]
        
        # Clean title to remove author name
        title = fname.replace('.html', '')
        for line in lines[:30]:
            if any(k in line for k in ['MASTER', 'Giám sát', 'Tìm', 'Tổng hợp', 'TOP', 'Ứng dụng']):
                title = line
                break
        title = re.sub(r'TRẦN VĂN BÌNH MASTER_?\s*', '', title, flags=re.IGNORECASE).strip()
        title = re.sub(r'\[VIP5\]|\[VIP\]', '', title, flags=re.IGNORECASE).strip()
        
        sql_blocks = []
        current_sql = []
        in_sql = False
        keywords = ('SELECT', 'WITH', 'ALTER', 'UPDATE', 'DELETE', 'SHOW', 'SET', 'GRANT', 'REVOKE')
        
        for line in lines:
            upper_l = line.upper()
            if any(upper_l.startswith(k) for k in keywords):
                if current_sql:
                    sql_txt = '\n'.join(current_sql).strip()
                    if (';' in sql_txt or 'FROM' in sql_txt.upper() or 'V$' in sql_txt.upper()) and is_valid_monitoring_sql(sql_txt):
                        sql_blocks.append(sql_txt)
                    current_sql = []
                in_sql = True
            if in_sql:
                if upper_l.startswith(('HTTP://', 'HTTPS://', 'SEARCH', 'HOME', 'MENU', 'LOGOUT', 'LOGIN')):
                    in_sql = False
                    current_sql = []
                    continue
                current_sql.append(line)
                if line.endswith(';'):
                    sql_txt = '\n'.join(current_sql).strip()
                    if len(sql_txt) > 15 and is_valid_monitoring_sql(sql_txt):
                        sql_blocks.append(sql_txt)
                    current_sql = []
                    in_sql = False
                    
        if current_sql:
            sql_txt = '\n'.join(current_sql).strip()
            if len(sql_txt) > 15 and ('FROM' in sql_txt.upper() or 'V$' in sql_txt.upper() or 'DBA_' in sql_txt.upper()) and is_valid_monitoring_sql(sql_txt):
                sql_blocks.append(sql_txt)

        unique_sqls = []
        seen = set()
        for s in sql_blocks:
            s_generic = sanitize_generic_sql(s)
            s_clean = re.sub(r'\s+', ' ', s_generic).strip()
            if s_clean and s_clean not in seen:
                seen.add(s_clean)
                unique_sqls.append(s_generic)
                
        if not unique_sqls:
            continue
            
        file_count += 1
        total_queries += len(unique_sqls)
        
        report_lines.append(f'## {file_count}. {title}')
        report_lines.append(f'**File nguồn**: `{fname}` | **Số lượng câu lệnh giám sát chuẩn**: {len(unique_sqls)}\n')
        
        for idx, sql in enumerate(unique_sqls, 1):
            tbls = extract_tables(sql)
            global_tables.update(tbls)
            
            report_lines.append(f'### 🔹 Câu lệnh {idx}')
            if tbls:
                tbl_formatted = [f'`{t}`' for t in tbls]
                report_lines.append('**Bảng/View truy vấn**: ' + ', '.join(tbl_formatted))
            else:
                report_lines.append('**Bảng/View truy vấn**: _Bảng/View hệ thống tĩnh (Dual / System parameters)_')
            
            report_lines.append('```sql')
            report_lines.append(sql)
            report_lines.append('```\n')
            
    report_lines.append('---\n')
    report_lines.append('## 📊 TỔNG HỢP CÁC BẢNG & V$ VIEWS CHUẨN ORACLE ĐƯỢC SỬ DỤNG')
    report_lines.append(f'Tổng số bảng/views hệ thống Oracle chuẩn dùng chung: **{len(global_tables)}**\n')

    v_views = sorted([t for t in global_tables if t.startswith(('V$', 'GV$', 'V_$'))])
    dba_views = sorted([t for t in global_tables if t.startswith(('DBA_', 'ALL_', 'USER_'))])
    other_tables = sorted([t for t in global_tables if t not in v_views and t not in dba_views])

    report_lines.append('### 1. Dynamic Performance Views (V$ / GV$ Views)')
    report_lines.append(', '.join([f'`{t}`' for t in v_views]) + '\n')

    report_lines.append('### 2. Data Dictionary Views (DBA_ / ALL_ / USER_ Views)')
    report_lines.append(', '.join([f'`{t}`' for t in dba_views]) + '\n')

    if other_tables:
        report_lines.append('### 3. Bảng dữ liệu / System Tables chuẩn khác')
        report_lines.append(', '.join([f'`{t}`' for t in other_tables]) + '\n')

    out_file = '/root/RnD/OpenSRE/sqltunning/oracle_monitoring_queries_summary.md'
    with open(out_file, 'w', encoding='utf-8') as f_out:
        f_out.write('\n'.join(report_lines))
        
    print(f'Done! Fully standardized generic summary generated at {out_file} with {file_count} sections and {total_queries} queries.')

if __name__ == '__main__':
    generate_md()
