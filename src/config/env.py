from src.utils.infisical import getenv_or_action
import os

# if file .env exists, load it.
if os.path.exists("src/config/.env"):
    import dotenv

    dotenv.load_dotenv(dotenv_path="src/config/.env", override=True)

USE_LOCAL_API = (
    getenv_or_action(env_name="USE_LOCAL_API", default="false", action="ignore")
    == "true"
)
GEMINI_API_KEY = getenv_or_action(env_name="GEMINI_API_KEY", action="ignore")
API_TOKEN = getenv_or_action(env_name="API_TOKEN", action="ignore")
