# Test fixtures and boundaries

Tests intentionally do not bundle a purported railway model or third-party photographs.

- `InspectionTests`: generated solid-color JPEG exercises Apple's actual local Vision classifier. Assertions concern successful inference and bounded output, not semantic accuracy on a blank image.
- `ClassifierContractTests`: malformed UTF-8 bytes as an image; nonexistent `.mlmodelc` in a temporary directory to verify model-load failure; `VNRectangleObservation` to reject detector-style results; synthetic model-signature values for image input/label/probability rules; synthetic findings for confidence, duplicate, sorting and count validation.
- `LifecycleTests`: continuation-controlled analyzer deliberately ignores cancellation, as an in-progress synchronous framework request may. Tests release all continuations to avoid leaked work.
- `PrivacyTimingTests`: injected monotonic time allows boundary tests for five-second context sends and twelve-second frame stalls, without wall-clock waiting. No paid API call or physical microphone input is used.

These validate the optional classifier boundary, not end-to-end inference on a trained custom Core ML artifact. An actual inspection model must add its own licensed fixtures, preprocessing checks and accuracy validation under a separate feature specification.
