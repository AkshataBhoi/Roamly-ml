"use client";

import { useState, useEffect } from "react";
import { DetailScreen } from "./components/DetailScreen";
import { Header } from "./components/Header";
import { HomeScreen } from "./components/HomeScreen";
import { StoryScreen } from "./components/StoryScreen";
import { ResultsScreen } from "./components/ResultsScreen";
import { SavedScreen } from "./components/SavedScreen";
import { PLACES } from "./data/mockPlaces";
import { Place, Screen } from "./types";

const SAVED_PLACES_STORAGE_KEY = "roamly:saved-places";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedLocation, setSelectedLocation] = useState("Mumbai , Maharashtra");
  const [latitude, setLatitude] = useState<number | undefined>(19.0761);
  const [longitude, setLongitude] = useState<number | undefined>(72.8774);
  const [selectedTime, setSelectedTime] = useState("3h");
  const [selectedMood, setSelectedMood] = useState("Relax");
  const [preferenceText, setPreferenceText] = useState("");
  const [savedPlaces, setSavedPlaces] = useState<Place[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [activePlace, setActivePlace] = useState<Place | null>(null);

  // Results state
  const [results, setResults] = useState<Place[]>(PLACES);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load saved places on client mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SAVED_PLACES_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const validPlaces: Place[] = parsed.filter(
            (item): item is Place => Boolean(item && typeof item === "object" && item.id && item.name)
          );
          setSavedPlaces(validPlaces);
          setSavedIds(new Set(validPlaces.map((p) => p.id)));
        }
      }
    } catch (e) {
      console.warn("Failed to load saved places from localStorage:", e);
    }
  }, []);

  function toggleSave(id: string) {
    setSavedPlaces((prevPlaces) => {
      const isAlreadySaved = prevPlaces.some((p) => p.id === id);
      let nextPlaces: Place[];

      if (isAlreadySaved) {
        nextPlaces = prevPlaces.filter((p) => p.id !== id);
      } else {
        const placeToSave =
          results.find((p) => p.id === id) ||
          PLACES.find((p) => p.id === id) ||
          (activePlace?.id === id ? activePlace : null);

        if (placeToSave) {
          nextPlaces = [placeToSave, ...prevPlaces];
        } else {
          nextPlaces = prevPlaces;
        }
      }

      setSavedIds(new Set(nextPlaces.map((p) => p.id)));

      try {
        localStorage.setItem(SAVED_PLACES_STORAGE_KEY, JSON.stringify(nextPlaces));
      } catch (e) {
        console.warn("Failed to persist saved places to localStorage:", e);
      }

      return nextPlaces;
    });
  }

  function openDetail(place: Place) {
    setActivePlace(place);
    setScreen("detail");
  }

  function navigate(s: Screen) {
    setScreen(s);
    if (s !== "detail") setActivePlace(null);
  }

  const handleSearch = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setScreen("results");

    try {
      const { recommendationService } = await import("./services/recommendationService");

      const fetchedPlaces = await recommendationService.getRecommendations({
        location: selectedLocation,
        latitude,
        longitude,
        time: selectedTime,
        mood: selectedMood,
        preferenceText,
      });

      if (fetchedPlaces && fetchedPlaces.length > 0) {
        setResults(fetchedPlaces);
      } else {
        setResults([]);
        setErrorMessage(
          `No places found matching location '${selectedLocation.split(",")[0].trim()}', time '${selectedTime}', and mood '${selectedMood}'. Try broadening your search or time window.`
        );
      }
    } catch (error: any) {
      console.warn("Backend recommendations call error:", error);
      setResults([]);
      setErrorMessage(error.message || "An unexpected error occurred while fetching recommendations.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground selection:bg-emerald-500 selection:text-black">
      <Header activeScreen={screen} onNavigate={navigate} />

      {/* 1. Hero Page: Full-screen display, 0 scroll, "Start Exploring" -> /story */}
      {screen === "home" && (
        <HomeScreen onStartExploring={() => setScreen("story")} />
      )}

      {/* 2. My Story / Location Input Page: Scene Setter console */}
      {screen === "story" && (
        <StoryScreen
          selectedLocation={selectedLocation}
          setSelectedLocation={setSelectedLocation}
          latitude={latitude}
          setLatitude={setLatitude}
          longitude={longitude}
          setLongitude={setLongitude}
          selectedTime={selectedTime}
          setSelectedTime={setSelectedTime}
          selectedMood={selectedMood}
          setSelectedMood={setSelectedMood}
          preferenceText={preferenceText}
          setPreferenceText={setPreferenceText}
          onFindSpot={handleSearch}
          onBackToHero={() => setScreen("home")}
        />
      )}

      {/* 3. Places Page: Edge-to-edge layout, strict filtering, 3/4 col toggle */}
      {screen === "results" && (
        <ResultsScreen
          selectedLocation={selectedLocation}
          selectedTime={selectedTime}
          selectedMood={selectedMood}
          places={results}
          savedIds={savedIds}
          onToggleSave={toggleSave}
          onPlaceClick={openDetail}
          onEditPreferences={() => setScreen("story")}
          isLoading={isLoading}
          errorMessage={errorMessage}
        />
      )}

      {/* 4. Recommendation Explanation Detail Page */}
      {screen === "detail" && activePlace && (
        <DetailScreen
          place={activePlace}
          saved={savedIds.has(activePlace.id)}
          onToggleSave={() => toggleSave(activePlace.id)}
          onBack={() => setScreen("results")}
        />
      )}

      {/* 5. Saved Places Collection */}
      {screen === "saved" && (
        <SavedScreen
          savedPlaces={savedPlaces}
          savedIds={savedIds}
          onToggleSave={toggleSave}
          onPlaceClick={openDetail}
        />
      )}
    </div>
  );
}
