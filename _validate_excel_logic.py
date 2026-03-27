#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
エクセルロジック と アプリケーション計算結果の検証
- バックアップデータの expenses から月別請求額を集計
- EXCEL_MONTHLY_MODEL の現金値と比較
- カード請求額が合致しているか確認
"""

import json
from datetime import datetime, timedelta
from collections import defaultdict

# ================== Excel Monthly Model（アプリ定義値） ==================
EXCEL_MONTHLY_MODEL = {
    "2025-12": {"cash": 1573, "credit": 120000},
    "2026-01": {"cash": 8449, "credit": -10400},
    "2026-02": {"cash": 7641, "credit": -2003},
    "2026-03": {"cash": 9782, "credit": 24312},
    "2026-04": {"cash": 58117, "credit": 111190},
    "2026-05": {"cash": 149372, "credit": 111190},
    "2026-06": {"cash": 327505},
    "2026-07": {"cash": 505638},
    "2026-08": {"cash": 683771},
    "2026-09": {"cash": 861904},
    "2026-10": {"cash": 1040037},
    "2026-11": {"cash": 1218170},
    "2026-12": {"cash": 1396303},
}

BUILTIN_FIXED_COSTS = [
    {"id": "nttDocomo", "label": "NTT docomo wifi費", "amount": 5940, "cardType": "d"},
    {"id": "seikei", "label": "整形分割", "amount": 21230, "cardType": "イオン", "endMonthKey": "2026-05"},
    {"id": "netflix", "label": "Netflix", "amount": 1590, "cardType": "イオン"},
    {"id": "youtube", "label": "YouTube Premium", "amount": 1280, "cardType": "イオン"},
]

# ================== バックアップデータ読み込み ==================
with open('c:/webアプリ/kakeibo-backup-20260326.json', 'r', encoding='utf-8') as f:
    backup_data = json.load(f)

expenses = backup_data.get('expenses', [])
print("\n" + "="*80)
print("エクセルロジック検証レポート")
print("="*80)
print(f"エクスポート日時: {backup_data.get('exportedAt')}")
print(f"経費エントリ数: {len(expenses)}")
print()

# ================== 月別カード請求計算 ==================
def get_billing_month(expense_date, card_type):
    """支出日からカード請求月を計算"""
    exp_dt = datetime.strptime(expense_date, '%Y-%m-%d')
    
    if card_type == 'イオン':
        # 11日以降は今月閉鎖 = 来月請求
        if exp_dt.day >= 11:
            billing_dt = exp_dt.replace(day=1) + timedelta(days=32)
            billing_dt = billing_dt.replace(day=1)
        else:
            billing_dt = exp_dt.replace(day=1)
    elif card_type == 'd':
        # 16日以降は今月閉鎖 = 来月請求
        if exp_dt.day >= 16:
            billing_dt = exp_dt.replace(day=1) + timedelta(days=32)
            billing_dt = billing_dt.replace(day=1)
        else:
            billing_dt = exp_dt.replace(day=1)
    else:
        return None
    
    return billing_dt.strftime('%Y-%m')

# 月別集計（カード種別別）
monthly_bills = defaultdict(lambda: {'イオン': 0, 'd': 0, '現金': 0})
monthly_expenses = defaultdict(lambda: {'イオン': 0, 'd': 0, '現金': 0})

for exp in expenses:
    exp_date = exp['date']
    card_type = exp.get('cardType', '現金')
    amount = exp.get('amount', 0)
    
    exp_month = exp_date[:7]
    monthly_expenses[exp_month][card_type] += amount
    
    if card_type != '現金':
        billing_month = get_billing_month(exp_date, card_type)
        if billing_month:
            monthly_bills[billing_month][card_type] += amount

# ================== 出力 ==================
print("\n■ 実データ（バックアップ）からの月別支出")
print("-" * 80)
print(f"{'発生月':<12} {'イオン':>15} {'d':>15} {'現金':>15} {'計':>15}")
print("-" * 80)

for month in sorted(monthly_expenses.keys()):
    aeon = monthly_expenses[month]['イオン']
    d_card = monthly_expenses[month]['d']
    cash = monthly_expenses[month]['現金']
    total = aeon + d_card + cash
    print(f"{month:<12} ¥{aeon:>13,} ¥{d_card:>13,} ¥{cash:>13,} ¥{total:>13,}")

print("\n■ 月別カード請求額（支出日ベースで計算）")
print("-" * 80)
print(f"{'請求月':<12} {'イオン':>15} {'d':>15} {'計':>15}")
print("-" * 80)

for month in sorted(monthly_bills.keys()):
    aeon = monthly_bills[month]['イオン']
    d_card = monthly_bills[month]['d']
    total = aeon + d_card
    print(f"{month:<12} ¥{aeon:>13,} ¥{d_card:>13,} ¥{total:>13,}")

# ================== 使用可能現金の計算検証 ==================
print("\n■ 使用可能現金（EXCEL_MONTHLY_MODEL ベース）")
print("-" * 80)
print(f"{'月':<12} {'Excel値':>15} {'状態':>20}")
print("-" * 80)

for month in sorted(EXCEL_MONTHLY_MODEL.keys()):
    excel_val = EXCEL_MONTHLY_MODEL[month].get('cash', 0)
    
    # 2026-01 から 2026-05 のみが API データ基準バックアップ
    if month in ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05']:
        status = "✓ API データ有"
    else:
        status = "- ハードコード値"
    
    print(f"{month:<12} ¥{excel_val:>13,} {status}")

# ================== 固定費影響分析 ==================
print("\n■ 固定費（ビルトイン）の月別影響")
print("-" * 80)

builtin_monthly = defaultdict(int)
for fc in BUILTIN_FIXED_COSTS:
    card_type = fc.get('cardType')
    amount = fc.get('amount')
    start_month = fc.get('startMonthKey', '2025-12')
    end_month = fc.get('endMonthKey', '2026-12')
    
    for month_dt in [datetime.strptime(m, '%Y-%m') for m in EXCEL_MONTHLY_MODEL.keys()]:
        month_key = month_dt.strftime('%Y-%m')
        if start_month <= month_key <= end_month:
            builtin_monthly[month_key] += amount

total_builtin = sum(builtin_monthly.values())
print(f"総計: ¥{total_builtin:,} (4件の固定費の合計)")
for month in sorted(EXCEL_MONTHLY_MODEL.keys()):
    print(f"  {month}: ¥{builtin_monthly[month]:,}")

# ================== 検証サマリー ==================
print("\n" + "="*80)
print("検証サマリー")
print("="*80)

print("\n1. データが正しく読み込まれているか？")
print(f"   ・経費エントリ: {len(expenses)}件 ✓")
print(f"   ・対象月: {min(monthly_expenses.keys())} ～ {max(monthly_expenses.keys())}")

print("\n2. カード請求計算ロジックは正しいか？")
print(f"   ・イオン（11-10閉鎖）: {sum(monthly_bills[m]['イオン'] for m in monthly_bills)}円")
print(f"   ・d（16-15閉鎖）: {sum(monthly_bills[m]['d'] for m in monthly_bills)}円")

print("\n3. Excel 現金値の確認")
print(f"   ・定義済みExcel月: {len(EXCEL_MONTHLY_MODEL)}ヶ月")
print(f"   ・API基準データ: 2026-01～2026-05")

print("\n次のステップ:")
print("  1. アプリでローカルストレージをクリア")
print("  2. ブラウザリロードしてバックアップ自動読み込みを確認")
print("  3. 表示される使用可能現金がExcel値と一致するか確認")
print("  4. 不一致の場合は calculateCashAvailableAmount() の計算ロジックをチェック")

print("\n" + "="*80)
