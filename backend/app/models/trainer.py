from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from app.features.pipeline import FEATURE_COLUMNS, model_frame

CLASS_ORDER = [-1, 0, 1]


def train_evaluate(bars: pd.DataFrame) -> dict[str, Any]:
    dataset = model_frame(bars)
    if len(dataset) < 120:
        raise ValueError("Not enough usable data to train; at least 120 feature rows are required")
    x, y = dataset[FEATURE_COLUMNS], dataset["label"].astype(int)
    split_train, split_valid = int(len(dataset) * 0.6), int(len(dataset) * 0.8)
    train_stop = split_train - 3
    valid_stop = split_valid - 3
    if train_stop < 40 or valid_stop <= split_train:
        raise ValueError("Training data needs more observations and at least two label classes")
    train_x, train_y = x.iloc[:train_stop], y.iloc[:train_stop]
    valid_x, valid_y = x.iloc[split_train:valid_stop], y.iloc[split_train:valid_stop]
    test_x, test_y = x.iloc[split_valid:], y.iloc[split_valid:]
    if len(set(train_y)) < 2:
        raise ValueError("Training data needs at least two label classes")
    candidates = {
        "Logistic Regression": make_pipeline(SimpleImputer(), StandardScaler(), LogisticRegression(
            class_weight="balanced", max_iter=500, random_state=42
        )),
        "Random Forest": make_pipeline(SimpleImputer(), RandomForestClassifier(
            n_estimators=120, max_depth=6, min_samples_leaf=4, class_weight="balanced",
            random_state=42, n_jobs=-1
        )),
        "Gradient Boosting": make_pipeline(SimpleImputer(), HistGradientBoostingClassifier(
            max_iter=100, max_leaf_nodes=15, l2_regularization=1.0, random_state=42
        )),
    }
    results: dict[str, Any] = {}
    fitted_models = {}
    for name, estimator in candidates.items():
        estimator.fit(train_x, train_y)
        fitted_models[name] = estimator
        results[name] = {}
        for label, sample_x, sample_y in (
            ("train", train_x, train_y), ("validation", valid_x, valid_y), ("test", test_x, test_y)
        ):
            prediction = estimator.predict(sample_x)
            results[name][label] = {
                "accuracy": round(float(accuracy_score(sample_y, prediction)), 4) if len(sample_y) else 0,
                "precision": round(float(precision_score(sample_y, prediction, average="macro", zero_division=0)), 4) if len(sample_y) else 0,
                "recall": round(float(recall_score(sample_y, prediction, average="macro", zero_division=0)), 4) if len(sample_y) else 0,
                "f1": round(float(f1_score(sample_y, prediction, average="macro", zero_division=0)), 4) if len(sample_y) else 0,
            }
    best_name = max(results, key=lambda name: results[name]["validation"]["f1"])
    best = fitted_models[best_name]
    predictions = best.predict(test_x)
    matrix = confusion_matrix(test_y, predictions, labels=CLASS_ORDER).tolist()
    importances = np.zeros(len(FEATURE_COLUMNS))
    final_estimator = best[-1]
    if hasattr(final_estimator, "feature_importances_"):
        importances = final_estimator.feature_importances_
    elif hasattr(final_estimator, "coef_"):
        importances = np.mean(np.abs(final_estimator.coef_), axis=0)
    top_features = sorted(
        [{"feature": feature, "importance": float(value)} for feature, value in zip(FEATURE_COLUMNS, importances)],
        key=lambda item: item["importance"],
        reverse=True,
    )[:12]
    probabilities = best.predict_proba(test_x)
    classes = list(final_estimator.classes_)
    latest = best.predict_proba(x.iloc[[-1]])[0]
    latest_probabilities = {str(int(label)): float(latest[classes.index(label)]) for label in classes}
    return {
        "selected_model": best_name,
        "comparison": results,
        "confusion_matrix": matrix,
        "class_order": CLASS_ORDER,
        "probability_class_order": [int(label) for label in classes],
        "feature_importance": top_features,
        "latest_probabilities": latest_probabilities,
        "test_labels": test_y.astype(int).tolist(),
        "test_probabilities": probabilities.tolist(),
        "model_rows": len(dataset),
    }
