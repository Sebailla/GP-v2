/**
 * Type declaration for `nodemailer-mock` (test-only). The package
 * ships as a CommonJS module without `types`, so vitest and tsc
 * fall back to `any`. This ambient declaration gives consumers
 * the small subset of the API we actually call:
 *   - `createTransport(options)` returns a transport with `sendMail(email)`.
 *   - `mock.setShouldFailOnce()` / `setFailResponse(err)` script failure.
 *   - `mock.getSentMail()` returns the recorded `[mail]`.
 *   - `mock.reset()` clears state between tests.
 */
declare module "nodemailer-mock" {
  interface MockTransport {
    sendMail: (email: Record<string, unknown>) => Promise<{ response: string }>;
  }

  interface MockControl {
    setShouldFailOnce: () => void;
    setShouldFail: (shouldFail: boolean) => void;
    setShouldFailCheck: (check: (email: Record<string, unknown>) => boolean) => void;
    setMockedVerify: (mocked: boolean) => void;
    setSuccessResponse: (response: string) => void;
    setFailResponse: (error: Error) => void;
    getSentMail: () => ReadonlyArray<Record<string, unknown>>;
    reset: () => void;
  }

  interface NodemailerMock {
    (options?: Record<string, unknown>): MockTransport;
    createTransport: (
      options?: Record<string, unknown>,
      plugin?: Record<string, unknown>,
    ) => MockTransport;
    mock: MockControl;
    getMockFor: (real: unknown) => NodemailerMock;
  }

  const nodemailerMock: NodemailerMock;
  export default nodemailerMock;
  export { nodemailerMock };
}
