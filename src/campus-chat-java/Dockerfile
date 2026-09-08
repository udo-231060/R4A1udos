FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
COPY src ./src
RUN mvn --batch-mode -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --uid 10001 campus && chown campus /app
COPY --from=build --chown=campus:campus /build/target/campus-chat-1.0.0.jar app.jar
USER campus
ENV SERVER_ADDRESS=0.0.0.0
ENV SPRING_PROFILES_ACTIVE=github,postgres
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=65"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
