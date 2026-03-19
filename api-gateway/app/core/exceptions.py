from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse


class FinFlowException(Exception):
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message


class NotFoundError(FinFlowException):
    def __init__(self, resource: str, id: str):
        super().__init__(status.HTTP_404_NOT_FOUND, f"{resource} not found: {id}")


class ValidationError(FinFlowException):
    def __init__(self, message: str):
        super().__init__(status.HTTP_422_UNPROCESSABLE_ENTITY, message)


class ConflictError(FinFlowException):
    def __init__(self, message: str):
        super().__init__(status.HTTP_409_CONFLICT, message)


def add_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(FinFlowException)
    async def finflow_exception_handler(request: Request, exc: FinFlowException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "data": None, "error": exc.message},
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"success": False, "data": None, "error": "Internal server error"},
        )
