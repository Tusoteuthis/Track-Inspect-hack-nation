import Foundation
@preconcurrency import MWDATCore

/// Keeps DAT registration semantics inside the SDK boundary and makes pairing idempotent.
@MainActor enum MetaRegistrationFlow {
    static func begin(state: () -> RegistrationState,
                      start: () async throws -> Void) async throws -> GlassesRegistrationStatus {
        if let existing = status(for: state()) { return existing }
        do {
            try Task.checkCancellation()
            try await start()
            return status(for: state()) ?? .awaitingApproval
        } catch RegistrationError.alreadyRegistered {
            // State can race the start call. DAT raw error 0 is success for our intent.
            return .registered
        } catch let error as RegistrationError {
            throw AppFailure(message: message(for: error))
        }
    }

    /// A successful handoff may still require approval in Meta AI.
    static func unregister(state: () -> RegistrationState,
                           start: () async throws -> Void) async throws -> Bool {
        if state() == .available { return true }
        do {
            try Task.checkCancellation()
            try await start()
            return state() == .available
        } catch UnregistrationError.alreadyUnregistered {
            return true
        } catch let error as UnregistrationError {
            let message: String
            switch error {
            case .alreadyUnregistered: message = "TrackInspect is already unpaired."
            case .configurationInvalid: message = "Meta configuration is invalid. Check the app's Meta configuration and rebuild before retrying unpairing."
            case .metaAINotInstalled: message = "Install or update Meta AI, then retry unpairing TrackInspect."
            case .unknown: message = "Meta could not remove TrackInspect's access. Return to Meta AI, then try unpairing again."
            }
            throw AppFailure(message: message)
        }
    }

    static func consumeCallback(state: () -> RegistrationState,
                                handle: () async throws -> Bool) async throws -> GlassesRegistrationStatus? {
        do {
            guard try await handle() else { return nil }
            return status(for: state())
        } catch let error as WearablesHandleURLError {
            switch error {
            case .registrationError:
                throw AppFailure(message: String(localized: "Meta AI could not complete registration. Check that access was approved for TrackInspect, then return and try pairing again. If it repeats, verify the app's Meta configuration and trackinspect:// return link."))
            case .unregistrationError:
                throw AppFailure(message: String(localized: "Meta AI could not finish removing app access. Check TrackInspect's app access in Meta AI and try again."))
            }
        }
    }

    static func status(for state: RegistrationState) -> GlassesRegistrationStatus? {
        switch state {
        case .registered: return .registered
        case .registering: return .awaitingApproval
        case .available, .unavailable: return nil
        }
    }

    private static func message(for error: RegistrationError) -> String {
        switch error {
        case .alreadyRegistered:
            return GlassesRegistrationStatus.registered.message
        case .configurationInvalid:
            return String(localized: "Meta registration configuration is invalid. Check this app's Meta app ID, client token, Apple team, bundle ID ai.trackinspect.app and trackinspect:// return link, then rebuild.")
        case .metaAINotInstalled:
            return String(localized: "Install or update Meta AI on this iPhone, pair your glasses there, then return to TrackInspect and try pairing again.")
        case .networkUnavailable:
            return String(localized: "Meta registration needs an internet connection. Check Wi-Fi or mobile data, then try again.")
        case .unknown:
            return String(localized: "Meta could not start registration. Open Meta AI, check your glasses and app access, then return and try again.")
        }
    }
}
