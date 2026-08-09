"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDeferredResult = isDeferredResult;
function isDeferredResult(result) {
    return typeof result === "object" && result !== null && result.deferred === true;
}
//# sourceMappingURL=protocol.js.map