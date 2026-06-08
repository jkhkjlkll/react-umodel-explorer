FROM maven:3.9.9-eclipse-temurin-21 AS build

WORKDIR /workspace
COPY . .
RUN mvn package -pl apps/umodel-server -am -DskipTests

FROM eclipse-temurin:21-jre

WORKDIR /app
COPY --from=build /workspace/apps/umodel-server/target/*.jar /app/umodel-server.jar

ENV UMODEL_PORT=8080
ENV GRAPHSTORE=memory
ENV UMODEL_DATA_ROOT=/app/data
ENV UMODEL_AGENT_WRITE_ENABLED=false

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/umodel-server.jar"]
