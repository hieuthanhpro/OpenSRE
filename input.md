📊 Tóm tắt Top SQL tốn tài nguyên (AWR Snap 125190-125191)
🔥 Top CPU (Top 3 chiếm 20.6% tổng CPU)
SQL ID	Module	CPU Time	Execs	CPU/Exec	%Total	Vấn đề
fh4x6kqmvd70y	JDBC Thin Client	401.88s	1,503	0.27s	7.27%	SELECT * FROM (SELECT P.* FROM... - Full scan + pagination?
8nz7j30hybv0p	JDBC Thin Client	395.49s	6,328	0.06s	7.16%	SELECT R.N_ACQUIRER_ID... - High frequency
5qkjmg9humhnz	txn-collector	342.71s	4	85.68s	6.20%	⚠️ Exec=4, CPU/Exec=85s - Long-running query
🧠 Top Buffer Gets (RAM/Buffer Cache - Top 3 chiếm 43.9% tổng)
SQL ID	Module	Buffer Gets	Execs	Gets/Exec	%Total
9sthufx616c5w	JDBC Thin Client	130.1M	174,760	745	20.64%
2c3fvyacdx7q3	JDBC Thin Client	73.4M	646	113,689	11.64%
7mnxczr7fr9vs	JDBC Thin Client	73.1M	703	103,968	11.59%
💾 Top Disk I/O (Physical Reads - Top 3 chiếm 57.6% tổng)
SQL ID	Module	Phys Reads	Execs	Reads/Exec	%Total	%IO
2c3fvyacdx7q3	JDBC Thin Client	73.3M	646	113,451	30.63%	49.60%
0jp34w4u1c9kj	JDBC Thin Client	32.8M	317	103,599	13.73%	37.15%
6c9usgn628qz5	JDBC Thin Client	31.7M	317	99,982	13.25%	43.61%
🎯 3 SQL "Kẻ thù số 1" cần tối ưu ngay (xuất hiện ở cả 3 bảng)
SQL ID	Module	Vấn đề chính	Khuyến nghị
2c3fvyacdx7q3	JDBC Thin Client	#1 CPU (7.2%), #2 Buffer Gets (11.6%), #1 Phys Reads (30.6%)<br>SELECT NVL(SUM(N_OUT), 0) AS N...	Index trên cột WHERE/JOIN, check partition pruning, consider materialized view
7mnxczr7fr9vs	JDBC Thin Client	#2 Buffer Gets (11.6%), #3 Phys Reads (3.8%)<br>BEGIN :1 := onecredit.check_pa...	PL/SQL function call - check function logic, add index trên bảng tham chiếu
0jp34w4u1c9kj	JDBC Thin Client	#2 Phys Reads (13.7%), #6 Buffer Gets (6.2%)<br>BEGIN :1 := CHECK_FRAUD_APPLE_...	Fraud check function - optimize logic, reduce table scans
⚠️ Cảnh báo đặc biệt: Executions = 4 nhưng CPU = 342s
SQL ID: 5qkjmg9humhnz (txn-collector) - CPU/Exec = 85.68s
Query: SELECT * FROM (SELECT Q.SQL_I...
Hành động: Kiểm tra execution plan, có thể missing index hoặc cartesian join
💡 Next Steps gợi ý
Lấy Execution Plan cho 2c3fvyacdx7q3 (tác động lớn nhất)
Check Index trên các cột WHERE/JOIN của 3 SQL trên
Review PL/SQL functions CHECK_FRAUD_APPLE_*, onecredit.check_pa* - có thể inline hoặc optimize logic
Monitor 9sthufx616c5w - 174K executions, Gets/Exec thấp (745) nhưng volume lớn → có thể cache hoặc rewrite
Bạn muốn tôi deep-dive vào execution plan của SQL nào trước?