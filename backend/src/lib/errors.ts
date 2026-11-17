export class HttpError extends Error {
  readonly statusCode: number
  readonly code: string

  constructor(statusCode: number, message: string, code = 'HttpError') {
    super(message)
    this.name = code
    this.statusCode = statusCode
    this.code = code
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Bad request') {
    super(400, message, 'Bad Request')
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found') {
    super(404, message, 'Not Found')
  }
}

export class NotImplementedError extends HttpError {
  constructor(message = 'Not implemented') {
    super(501, message, 'Not Implemented')
  }
}

export class UpstreamError extends HttpError {
  constructor(message = 'Upstream service unavailable') {
    super(502, message, 'Bad Gateway')
  }
}

export class GatewayTimeoutError extends HttpError {
  constructor(message = 'Upstream request timed out') {
    super(504, message, 'Gateway Timeout')
  }
}
