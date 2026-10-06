CREATE OR REPLACE FUNCTION ONEMON.get_list_abnormal_transaction_scan RETURN SYS_REFCURSOR IS
    results SYS_REFCURSOR;
BEGIN
    OPEN results FOR SELECT
                                          *
                                      FROM
                                          (
                                              SELECT
                                                  t1.s_date,
                                                  t1.s_cardno,
                                                  t1.s_card_no_hash,
                                                  t1.s_ip_address,
                                                  t1.s_ticket_number,
                                                  t1.s_merchantid,
                                                  t1.s_merchanttransactionreferen,
                                                  t1.s_transactionid,
                                                  t1.n_amount,
                                                  t1.s_currency,
                                                  t1.s_authentication_state,
                                                  t1.s_orderreference,
                                                  t1.s_responsecode,
                                                  t1.s_transactiontype
                                              FROM
                                                  onefraud.tbl_transaction t1
                                              WHERE
                                                      t1.s_date >= to_char(sysdate - 2 / 24, 'YYYY-MM-DD HH24:MI:SS')
                                                  AND t1.s_transactiontype IN ( 'Purchase', 'Authorisation', 'Refund' )
                                                  AND t1.d_update1 IS NOT NULL
                                                  AND t1.s_responsecode != '99'
                                                  AND ( t1.s_tracking_input IS NULL
                                                        OR ( t1.s_tracking_input IS NOT NULL
                                                             AND t1.s_tracking_input <> 'applepay' ) )
                                                  AND NOT EXISTS (
                                                      SELECT
                                                          NULL
                                                      FROM
                                                          tb_scanned_transaction_adm t2
                                                      WHERE
                                                              t2.s_merchant_id = t1.s_merchantid
                                                          AND t2.s_transaction_id = t1.s_transactionid
                                                          AND t2.s_data_source = 'INTERNATIONAL_GATEWAY'
                                                          AND t2.s_transaction_type = t1.s_transactiontype
                                                  )
                                          )
                     WHERE
                         ROWNUM <= 500; -- Giới hạn 500 bản ghi


    RETURN results;
END get_list_abnormal_transaction_scan;