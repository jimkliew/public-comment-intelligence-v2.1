from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Anthropic
    anthropic_api_key: str = ""

    # Regulations.gov
    regulations_gov_api_key: str = ""

    # Neo4j
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "docketiq2024"

    # Federal Register
    federal_register_base_url: str = "https://www.federalregister.gov/api/v1"

    # Processing
    embedding_model: str = "all-MiniLM-L6-v2"
    near_duplicate_threshold: float = 0.92
    campaign_threshold: float = 0.85
    campaign_min_organized: int = 50
    campaign_min_coordinated: int = 10

    # Claude
    claude_model: str = "claude-sonnet-4-20250514"

    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
