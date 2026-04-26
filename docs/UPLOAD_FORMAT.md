# Candidate Database Upload

Plumb supports two upload formats from the home page candidate database selector.

## JSON

Upload either an array of candidates or an object with a `candidates` array.

```json
[
  {
    "id": "candidate_001",
    "name": "Asha Rao",
    "current_title": "ML Engineer",
    "current_company": "SearchWorks",
    "years_experience": 4,
    "location": "Bengaluru, India",
    "skills": "Python, PyTorch, RAG, evaluation, search",
    "summary": "Built production retrieval and evaluation pipelines for enterprise search."
  }
]
```

Native Plumb `CandidateProfile` objects are preserved. Flat objects are normalized into the internal schema.

## CSV

Recommended headers:

```csv
name,title,company,years_experience,location,skills,summary,degree,school,github,writing,recent_signal
```

Uploaded databases are stored server-side, selected per JD, and used by rerank/top-up instead of the default seeded corpus. Optional `hidden_state` or `persona_hidden_state` fields are kept server-side for simulation and never returned through public candidate APIs.
