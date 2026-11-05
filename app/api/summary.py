from typing import Annotated

from fastapi import APIRouter, Query

from app.core.auth import Identity
from app.schemas.summary import (
    ExpenseAnalysis,
    ExpenseComparison,
    ExpenseComparisonInput,
    ExpenseSummary,
    SummaryFilters,
)
from app.services.summary import expense_analysis, expense_comparison, expense_summary

router = APIRouter(prefix="/api/v1/summary", tags=["summary"])


@router.get("", response_model=ExpenseSummary)
async def get_expense_summary(
    identity: Identity, filters: Annotated[SummaryFilters, Query()]
) -> ExpenseSummary:
    return await expense_summary(identity["sub"], filters.year)


@router.get("/analysis", response_model=ExpenseAnalysis)
async def get_expense_analysis(
    identity: Identity, filters: Annotated[SummaryFilters, Query()]
) -> ExpenseAnalysis:
    return await expense_analysis(identity["sub"], filters.year)


@router.post("/compare", response_model=ExpenseComparison)
async def compare_expenses(data: ExpenseComparisonInput, identity: Identity) -> ExpenseComparison:
    return await expense_comparison(identity["sub"], data)
