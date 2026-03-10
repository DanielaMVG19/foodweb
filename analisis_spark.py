from pyspark.sql import SparkSession
from pyspark.sql.functions import col, count, when
import os
from dotenv import load_dotenv

load_dotenv()
MONGO_URI = os.getenv("MONGO_URI")

# Iniciar sesión de Spark con el conector de MongoDB
# Nota: La primera vez descargará los conectores, tardará un poco.
spark = SparkSession.builder \
    .appName("AnalisisSeguridadSlotEats") \
    .config("spark.mongodb.input.uri", MONGO_URI) \
    .config("spark.mongodb.output.uri", MONGO_URI) \
    .config("spark.jars.packages", "org.mongodb.spark:mongo-spark-connector_2.12:3.0.1") \
    .getOrCreate()

print("📊 Conectando a Atlas para analizar 2.7 millones de registros...")

# Leer la colección de logs
df = spark.read.format("com.mongodb.spark.sql.DefaultSource") \
    .option("database", "SlotEatsDB") \
    .option("collection", "security_logs") \
    .load()

# --- PROCESAMIENTO BIG DATA ---

# 1. Contar intentos fallidos por IP
reporte_riesgo = df.filter(col("resultado") == "fallo") \
    .groupBy("ip") \
    .agg(count("*").alias("total_ataques"))

# 2. Clasificar el riesgo basado en el volumen
reporte_final = reporte_riesgo.withColumn("nivel_riesgo", 
    when(col("total_ataques") > 50, "🔥 CRÍTICO (Bloqueo IP)")
    .when(col("total_ataques") >= 10, "⚠️ MEDIO (Monitoreo)")
    .otherwise("✅ BAJO")
)

# Mostrar los resultados top
print("🚨 REPORTE DE CIBERSEGURIDAD - TOP IPS SOSPECHOSAS")
reporte_final.sort(col("total_ataques").desc()).show(20)

# Guardar el resultado en un CSV local para el reporte
# reporte_final.limit(100).toPandas().to_csv("auditoria_seguridad.csv")

spark.stop()