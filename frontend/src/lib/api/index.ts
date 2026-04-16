import * as _trips from "./trips";
import * as _locations from "./locations";
import * as _google from "./google";
import * as _itinerary from "./itinerary";
import * as _sharing from "./sharing";

/**
 * Typed API client.
 *
 * Namespaces mirror the old monolithic api object exactly.
 * `delete` is preserved as a key name (safe as object property);
 * the underlying modules export `del` to avoid the reserved-word
 * constraint on named exports.
 */
export const api = {
  trips: {
    list: _trips.list,
    get: _trips.get,
    create: _trips.create,
    update: _trips.update,
    delete: _trips.del,
  },
  locations: {
    list: _locations.list,
    add: _locations.add,
    batchAdd: _locations.batchAdd,
    update: _locations.update,
    delete: _locations.del,
    uploadPhoto: _locations.uploadPhoto,
    deletePhoto: _locations.deletePhoto,
    importGoogleListStream: _locations.importGoogleListStream,
  },
  google: {
    previewLocationFromLink: _google.previewLocationFromLink,
    autocomplete: _google.autocomplete,
    resolvePlace: _google.resolvePlace,
  },
  itinerary: {
    get: _itinerary.get,
    createDay: _itinerary.createDay,
    updateDay: _itinerary.updateDay,
    reassignDayDate: _itinerary.reassignDayDate,
    generateDays: _itinerary.generateDays,
    reconcileDays: _itinerary.reconcileDays,
    createOption: _itinerary.createOption,
    updateOption: _itinerary.updateOption,
    deleteOption: _itinerary.deleteOption,
    addLocationToOption: _itinerary.addLocationToOption,
    batchAddLocationsToOption: _itinerary.batchAddLocationsToOption,
    updateOptionLocation: _itinerary.updateOptionLocation,
    removeLocationFromOption: _itinerary.removeLocationFromOption,
    reorderOptionLocations: _itinerary.reorderOptionLocations,
    listRoutes: _itinerary.listRoutes,
    createRoute: _itinerary.createRoute,
    updateRoute: _itinerary.updateRoute,
    getRouteWithSegments: _itinerary.getRouteWithSegments,
    recalculateRoute: _itinerary.recalculateRoute,
    deleteRoute: _itinerary.deleteRoute,
  },
  sharing: {
    createShare: _sharing.createShare,
    getShare: _sharing.getShare,
    revokeShare: _sharing.revokeShare,
    getSharedTrip: _sharing.getSharedTrip,
  },
};

export * from "./types";
export type {
  AutocompleteSuggestion,
  AutocompleteLocationBias,
  AutocompleteRequestBody,
  AutocompleteResponsePayload,
  ResolvePlaceBody,
} from "./google";
export { ApiError } from "./transport";
