"""Custom HTTP exceptions for consistent error responses."""

from fastapi import HTTPException, status


class NotFoundError(HTTPException):
    def __init__(self, resource: str = "Resource"):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{resource} not found",
        )


class AlreadyExistsError(HTTPException):
    def __init__(self, resource: str = "Resource"):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{resource} already exists",
        )


class ForbiddenError(HTTPException):
    def __init__(self, detail: str = "Not enough permissions"):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
        )


class BadRequestError(HTTPException):
    def __init__(self, detail: str = "Bad request"):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
        )


class MindsDBError(HTTPException):
    def __init__(self, detail: str = "MindsDB service error"):
        super().__init__(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"MindsDB error: {detail}",
        )


class ServiceUnavailableError(HTTPException):
    def __init__(self, service: str = "Service"):
        super().__init__(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{service} is currently unavailable",
        )
