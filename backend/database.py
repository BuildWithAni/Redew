from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from models import Base

import os
import sys

def get_db_path():
    if getattr(sys, 'frozen', False):
        # Running in a bundle (e.g. PyInstaller)
        app_data = os.path.join(os.getenv('APPDATA', os.path.expanduser('~')), 'RedewMusic')
        if not os.path.exists(app_data):
            os.makedirs(app_data)
        return os.path.join(app_data, 'shakky_music.db')
    return os.path.abspath("./shakky_music.db")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    DATABASE_URL = f"sqlite+aiosqlite:///{get_db_path()}"

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

async def init_db():
    async with engine.begin() as conn:
        # await conn.run_sync(Base.metadata.drop_all) # Only for dev
        await conn.run_sync(Base.metadata.create_all)

async def get_db():
    async with async_session() as session:
        yield session
