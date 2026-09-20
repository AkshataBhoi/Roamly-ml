from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
import joblib
import os
import pandas as pd
from xgboost import XGBClassifier

app = FastAPI(title="Roamly ML Service")

# Setup paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
PREPROCESSOR_PATH = os.path.join(MODELS_DIR, "preprocessor.joblib")
MODEL_PATH = os.path.join(MODELS_DIR, "xgboost_model.json")

# Global variables for cached artifacts
preprocessor = None
model = None

@app.on_event("startup")
def load_artifacts():
    global preprocessor, model
    if not os.path.exists(PREPROCESSOR_PATH):
        raise RuntimeError(f"Preprocessor not found: {PREPROCESSOR_PATH}")
    if not os.path.exists(MODEL_PATH):
        raise RuntimeError(f"Model not found: {MODEL_PATH}")
    
    preprocessor = joblib.load(PREPROCESSOR_PATH)
    model = XGBClassifier()
    model.load_model(MODEL_PATH)

class PlaceFeature(BaseModel):
    city: str
    category: str
    mood: str
    available_time_min: int
    distance_km: float
    visit_duration_min: int
    preference_match: float
    is_open: int
    time_fit: int
    distance_fit: int

@app.post("/predict")
def predict(features: List[PlaceFeature]):
    if not features:
        return {"predictions": []}
    
    try:
        # Convert request to DataFrame
        df = pd.DataFrame([f.dict() for f in features])
        
        feature_columns = [
            "city", "category", "mood", "available_time_min", 
            "distance_km", "visit_duration_min", "preference_match", 
            "is_open", "time_fit", "distance_fit"
        ]
        
        for col in feature_columns:
            if col not in df.columns:
                df[col] = 0
                
        df = df[feature_columns]
        
        # Preprocess and predict
        X_encoded = preprocessor.transform(df)
        probabilities = model.predict_proba(X_encoded)
        predictions = model.predict(X_encoded)
        
        results = []
        for i in range(len(features)):
            results.append({
                "suitability_probability": float(probabilities[i][1]),
                "suitability_class": int(predictions[i])
            })
            
        return {"predictions": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
