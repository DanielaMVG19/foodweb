import os
import random
from faker import Faker
from pymongo import MongoClient
from datetime import datetime, timezone
from dotenv import load_dotenv # [NUEVO] Para leer el .env

# Cargamos las variables del archivo .env
load_dotenv()
MONGO_URI = os.getenv("MONGO_URI")

fake = Faker()

# Configuración del cliente con Timeout para evitar bloqueos de red
client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=20000)
db = client["SlotEatsDB"]
logs_col = db["security_logs"]

try:
    # Verificación rápida de conexión
    client.admin.command('ping')
    print("✅ Conexión exitosa a MongoDB Atlas usando .env")
except Exception as e:
    print(f"❌ Error de conexión: {e}")
    print("TIP: Revisa que tu IP esté en 'Network Access' en Atlas (0.0.0.0/0)")
    exit()

print("🚀 Iniciando carga masiva de 4,000,000 de registros...")

total_registros = 4000000
lote_size = 5000 
registros = []

for i in range(1, total_registros + 1):
    # Simulación de atacante recurrente
    if i % 1000 == 0:
        ip_origen = "185.220.101.34"
        user = "admin1@sloteats.com"
        resultado = "fallo"
    else:
        ip_origen = fake.ipv4()
        user = fake.email()
        resultado = random.choice(["exito", "fallo"])

    data = {
        "ip": ip_origen,
        "email": user,
        "fecha": datetime.now(timezone.utc),
        "resultado": resultado,
        "intento_n": random.randint(1, 4)
    }
    registros.append(data)

    # Inserción por lotes
    if len(registros) >= lote_size:
        try:
            logs_col.insert_many(registros)
            registros = []
            print(f"✅ Procesados: {i} registros...")
        except Exception as e:
            print(f"⚠️ Error en lote: {e}")

print("✨ Carga masiva completada con éxito.")