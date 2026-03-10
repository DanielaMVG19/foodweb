from pyspark.sql import SparkSession
from pyspark.sql.functions import col, count, when

# IMPORTANTE: Reemplaza con tu MONGO_URI
uri = "mongodb://whosmarny:Dnxlsmth.6@ac-ffcuj0z-shard-00-00.eazfo3x.mongodb.net:27017,ac-ffcuj0z-shard-00-01.eazfo3x.mongodb.net:27017,ac-ffcuj0z-shard-00-02.eazfo3x.mongodb.net:27017/SlotEatsDB?ssl=true&replicaSet=atlas-m4v6h3-shard-0&authSource=admin&retryWrites=true&w=majority"

# Iniciar Spark con el conector de MongoDB
spark = SparkSession.builder \
    .appName("AuditoriaSeguridadSlotEats") \
    .config("spark.mongodb.input.uri", uri) \
    .config("spark.mongodb.output.uri", uri) \
    .config("spark.jars.packages", "org.mongodb.spark:mongo-spark-connector_2.12:3.0.1") \
    .getOrCreate()

print("📊 Leyendo datos desde MongoDB Atlas...")

# Leer la colección de logs
df = spark.read.format("com.mongodb.spark.sql.DefaultSource") \
    .option("collection", "security_logs") \
    .load()

# 1. Filtrar fallos y agrupar por IP
analisis_ips = df.filter(col("resultado") == "fallo") \
    .groupBy("ip") \
    .agg(count("*").alias("total_ataques"))

# 2. Clasificar Riesgo
# ALTO: > 20 intentos (Bloqueo inmediato)
# MEDIO: 5-20 intentos (Monitoreo)
# BAJO: < 5 intentos (Error de usuario)
reporte_final = analisis_ips.withColumn("nivel_riesgo", 
    when(col("total_ataques") > 20, "CRÍTICO - ALTO")
    .when(col("total_ataques") >= 5, "MEDIO")
    .otherwise("BAJO")
)

print("🚨 Resultado del Análisis de Ciberseguridad:")
reporte_final.sort(col("total_ataques").desc()).show(20)

spark.stop()