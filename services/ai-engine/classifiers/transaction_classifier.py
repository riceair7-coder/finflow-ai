"""거래 설명 → 계정과목/거래처 자동 분류"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np


@dataclass
class ClassificationResult:
    account_code: str
    account_name: str
    confidence: float
    vendor_suggestion: Optional[str] = None


# 규칙 기반 사전 분류 (학습 데이터 적을 때 폴백)
RULE_MAP = {
    ("택시", "우버", "카카오T", "카카오택시"): ("51100", "교통비"),
    ("스타벅스", "카페", "커피", "편의점", "GS25", "CU", "세븐일레븐"): ("51200", "복리후생비"),
    ("항공", "KTX", "SRT", "기차", "비행기"): ("51110", "출장교통비"),
    ("호텔", "숙박", "모텔"): ("51300", "숙박비"),
    ("AWS", "Azure", "GCP", "클라우드", "인프라"): ("52100", "서버비"),
    ("광고", "페이스북", "구글 광고", "네이버 광고"): ("55100", "광고선전비"),
}


class TransactionClassifier:
    def __init__(self, model_path: Optional[str] = None):
        self._model = None
        self._vectorizer = None
        if model_path and Path(model_path).exists():
            self._load_model(model_path)

    def _load_model(self, model_path: str) -> None:
        import joblib
        bundle = joblib.load(model_path)
        self._model = bundle["model"]
        self._vectorizer = bundle["vectorizer"]

    def classify(self, description: str, amount: float = 0.0) -> ClassificationResult:
        # 1) 규칙 기반 우선 적용
        for keywords, (code, name) in RULE_MAP.items():
            if any(kw in description for kw in keywords):
                return ClassificationResult(
                    account_code=code,
                    account_name=name,
                    confidence=0.95,
                )

        # 2) ML 모델 적용 (학습된 경우)
        if self._model and self._vectorizer:
            features = self._vectorizer.transform([description])
            proba = self._model.predict_proba(features)[0]
            idx = int(np.argmax(proba))
            code = self._model.classes_[idx]
            return ClassificationResult(
                account_code=code,
                account_name=code,
                confidence=float(proba[idx]),
            )

        # 3) 폴백: 미분류
        return ClassificationResult(
            account_code="99999",
            account_name="미분류",
            confidence=0.0,
        )

    def batch_classify(self, items: list[dict]) -> list[ClassificationResult]:
        return [self.classify(item.get("description", ""), item.get("amount", 0)) for item in items]

    def train(self, training_data: list[dict], model_output_path: str) -> dict:
        """간단한 TF-IDF + LogisticRegression 학습"""
        import joblib
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.linear_model import LogisticRegression
        from sklearn.model_selection import cross_val_score

        texts = [d["description"] for d in training_data]
        labels = [d["account_code"] for d in training_data]

        vectorizer = TfidfVectorizer(
            analyzer="char_wb",
            ngram_range=(2, 4),
            max_features=10_000,
        )
        X = vectorizer.fit_transform(texts)
        model = LogisticRegression(max_iter=500, C=1.0)
        scores = cross_val_score(model, X, labels, cv=5, scoring="accuracy")
        model.fit(X, labels)

        joblib.dump({"model": model, "vectorizer": vectorizer}, model_output_path)
        self._model = model
        self._vectorizer = vectorizer

        return {"accuracy_mean": float(scores.mean()), "accuracy_std": float(scores.std())}
