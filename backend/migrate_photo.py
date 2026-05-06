import sqlite3
import os

db_path = 'shakky_music.db'
if not os.path.exists(db_path):
    print(f"Database file not found at {db_path}")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute('ALTER TABLE users ADD COLUMN profile_photo TEXT')
        conn.commit()
        print("Column 'profile_photo' added successfully to 'users' table.")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e).lower():
            print("Column 'profile_photo' already exists.")
        else:
            print(f"Error: {e}")
    conn.close()
